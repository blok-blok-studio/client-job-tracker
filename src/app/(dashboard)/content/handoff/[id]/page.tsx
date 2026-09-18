import { notFound, redirect } from "next/navigation";
import type { ContentPost } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import HandoffView, { type HandoffPost } from "@/components/content/handoff/HandoffView";
import { lookupFormattedMedia } from "@/lib/social/renditions";
import { readAssignedSound } from "@/lib/trending-sound";

export const dynamic = "force-dynamic";

/**
 * Manual-posting handoff. The runner links here when an ASSISTED post comes
 * due (RedNote, or anything the platform API can't do). Built to be opened on
 * the phone that will do the posting.
 */
export default async function HandoffPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  // Cast: Prisma's include type inference is broken repo-wide
  const post = (await prisma.contentPost.findUnique({
    where: { id },
    include: { client: { select: { id: true, name: true, timezone: true } } },
  })) as (ContentPost & { client: { id: string; name: string; timezone: string | null } }) | null;
  if (!post) notFound();

  // Hand over exactly what the composer's format produced (9:16 with bars, a
  // crop, ...), not the original upload
  const [assignee, library, formatted] = await Promise.all([
    post.assignedToId
      ? prisma.user.findUnique({ where: { id: post.assignedToId }, select: { name: true } })
      : Promise.resolve(null),
    post.mediaUrls.length
      ? prisma.clientMedia.findMany({
          where: { clientId: post.clientId, url: { in: post.mediaUrls } },
          select: { id: true, url: true, filename: true, fileType: true, mimeType: true, fileSize: true, thumbnailUrl: true, playbackUrl: true },
        })
      : Promise.resolve([]),
    lookupFormattedMedia(post),
  ]);
  const byUrl = new Map(library.map((m) => [m.url, m]));
  const settings = (post.platformSettings as Record<string, unknown> | null) || {};

  const data: HandoffPost = {
    id: post.id,
    platform: post.platform,
    status: post.status,
    publishMode: post.publishMode,
    postType: typeof settings.postType === "string" ? settings.postType : null,
    title: post.title,
    body: post.body,
    hashtags: post.hashtags,
    firstComment: post.firstComment,
    taggedUsers: post.taggedUsers,
    collaborators: post.collaborators,
    location: post.location,
    scheduledAt: post.scheduledAt?.toISOString() ?? null,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    externalUrl: post.externalUrl,
    approvalStatus: post.approvalStatus,
    approvalNote: post.approvalNote,
    assigneeName: assignee?.name ?? null,
    client: { id: post.client.id, name: post.client.name, timezone: post.client.timezone },
    trendingSound: readAssignedSound(settings),
    formatPending: formatted.items.some((item) => item.pending),
    media: formatted.items.map((item, i) => {
      const m = byUrl.get(item.sourceUrl);
      const isVideo = m ? m.fileType === "VIDEO" : /\.(mp4|mov|m4v|webm)(\?|$)/i.test(item.sourceUrl);
      if (item.formatted) {
        // The formatted copy is always a JPEG or an H.264 MP4
        const ext = isVideo ? "mp4" : "jpg";
        const base = (m?.filename || `${post.platform.toLowerCase()}-${i + 1}`).replace(/\.[a-z0-9]+$/i, "");
        return {
          url: item.url,
          mediaId: null, // library zip would hand out the unformatted original
          kind: isVideo ? ("video" as const) : ("image" as const),
          filename: `${base}.${ext}`,
          mimeType: isVideo ? "video/mp4" : "image/jpeg",
          fileSize: item.size,
          thumbnailUrl: isVideo ? m?.thumbnailUrl ?? null : item.url,
          playbackUrl: isVideo ? item.url : null,
        };
      }
      const ext = (item.url.split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1] || (isVideo ? "mp4" : "jpg")).toLowerCase();
      return {
        url: item.url,
        mediaId: m?.id ?? null,
        kind: isVideo ? ("video" as const) : ("image" as const),
        filename: m?.filename || `${post.platform.toLowerCase()}-${i + 1}.${ext}`,
        mimeType: m?.mimeType || (isVideo ? "video/mp4" : "image/jpeg"),
        fileSize: m?.fileSize ?? null,
        thumbnailUrl: m?.thumbnailUrl ?? null,
        playbackUrl: m?.playbackUrl ?? null,
      };
    }),
  };

  return <HandoffView post={data} />;
}
