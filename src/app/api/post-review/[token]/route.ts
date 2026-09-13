import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { lookupFormattedMedia } from "@/lib/social/renditions";
import { ASPECT_PRESETS, focusFor } from "@/lib/social/formats";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { notifyUser } from "@/lib/notifications";

/**
 * Public, token-scoped client sign-off for scheduled social posts (/p/<token>).
 * Only posts attached to this approval are ever read or written, and only
 * client-safe fields leave this route (no connections, errors, or internal notes).
 */

const decisionSchema = z.object({
  decisions: z
    .array(
      z.object({
        postId: z.string().min(1),
        decision: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
        note: z.string().trim().max(5000).optional(),
      })
    )
    .min(1)
    .max(200),
  name: z.string().trim().max(120).optional(),
});

type ApprovalWithPosts = {
  id: string;
  clientId: string;
  title: string | null;
  message: string | null;
  status: string;
  respondedAt: Date | null;
  client: { name: string; company: string | null; timezone: string | null };
  posts: Array<{
    id: string;
    platform: string;
    status: string;
    title: string | null;
    body: string | null;
    hashtags: string[];
    mediaUrls: string[];
    firstComment: string | null;
    scheduledAt: Date | null;
    platformSettings: unknown;
    approvalStatus: string | null;
    approvalNote: string | null;
    assignedToId: string | null;
  }>;
};

async function loadApproval(token: string): Promise<ApprovalWithPosts | null> {
  if (!/^[\w-]{16,128}$/.test(token)) return null;
  // Cast: Prisma's include type inference is broken repo-wide
  return (await prisma.contentApproval.findUnique({
    where: { token },
    include: {
      client: { select: { name: true, company: true, timezone: true } },
      posts: {
        select: {
          id: true,
          platform: true,
          status: true,
          title: true,
          body: true,
          hashtags: true,
          mediaUrls: true,
          firstComment: true,
          scheduledAt: true,
          platformSettings: true,
          approvalStatus: true,
          approvalNote: true,
          assignedToId: true,
        },
      },
    },
  })) as unknown as ApprovalWithPosts | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = rateLimit(getClientIp(request), { max: 30, prefix: "post-review-get" });
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const { token } = await params;
  const approval = await loadApproval(token);
  if (!approval) {
    return NextResponse.json({ success: false, error: "This review link is invalid or has been withdrawn." }, { status: 404 });
  }

  // Match media URLs to the client's library for posters and web-safe playback
  const urls = Array.from(new Set(approval.posts.flatMap((p) => p.mediaUrls)));
  const library = urls.length
    ? await prisma.clientMedia.findMany({
        where: { clientId: approval.clientId, url: { in: urls } },
        select: { url: true, fileType: true, mimeType: true, thumbnailUrl: true, playbackUrl: true, width: true, height: true },
      })
    : [];
  const byUrl = new Map(library.map((m) => [m.url, m]));

  // The client reviews exactly the frame that will be posted: the formatted
  // copy when it's ready, otherwise the original framed the same way in CSS
  const formattedByPost = new Map(
    await Promise.all(approval.posts.map(async (p) => [p.id, await lookupFormattedMedia(p)] as const))
  );

  const posts = [...approval.posts]
    .sort((a, b) => (a.scheduledAt?.getTime() ?? Infinity) - (b.scheduledAt?.getTime() ?? Infinity))
    .map((p) => {
      const settings = (p.platformSettings as Record<string, unknown> | null) || {};
      return {
        id: p.id,
        platform: p.platform,
        postType: typeof settings.postType === "string" ? settings.postType : null,
        title: p.title,
        body: p.body,
        hashtags: p.hashtags,
        firstComment: p.firstComment,
        scheduledAt: p.scheduledAt,
        published: p.status === "PUBLISHED",
        decision: p.approvalStatus,
        note: p.approvalNote,
        media: (formattedByPost.get(p.id)?.items ?? []).map((item) => {
          const formatted = formattedByPost.get(p.id)!;
          const m = byUrl.get(item.sourceUrl);
          const isVideo = m ? m.fileType === "VIDEO" : /\.(mp4|mov|m4v|webm)(\?|$)/i.test(item.sourceUrl);
          const preset = formatted.format ? ASPECT_PRESETS[formatted.format.aspect] : undefined;
          const focus = formatted.format ? focusFor(formatted.format, item.sourceUrl) : { x: 0.5, y: 0.5 };
          return {
            url: item.url,
            kind: isVideo ? "video" : "image",
            thumbnailUrl: item.formatted ? (isVideo ? m?.thumbnailUrl || null : item.url) : m?.thumbnailUrl || null,
            playbackUrl: item.formatted ? (isVideo ? item.url : null) : m?.playbackUrl || null,
            width: item.formatted ? preset?.width ?? null : m?.width ?? null,
            height: item.formatted ? preset?.height ?? null : m?.height ?? null,
            // Not formatted yet: show the original in the target frame (same math as the renderer)
            frame:
              item.pending && preset && formatted.format
                ? { ratio: preset.width / preset.height, fit: formatted.format.fit, focusX: focus.x, focusY: focus.y }
                : null,
          };
        }),
      };
    });

  return NextResponse.json({
    success: true,
    data: {
      clientName: approval.client.name,
      company: approval.client.company,
      timezone: approval.client.timezone,
      title: approval.title,
      message: approval.message,
      status: approval.status,
      respondedAt: approval.respondedAt,
      posts,
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = rateLimit(getClientIp(request), { max: 20, prefix: "post-review-post" });
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const { token } = await params;
  const approval = await loadApproval(token);
  if (!approval) {
    return NextResponse.json({ success: false, error: "This review link is invalid or has been withdrawn." }, { status: 404 });
  }

  let input: z.infer<typeof decisionSchema>;
  try {
    input = decisionSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ success: false, error: "Something was missing from your review. Please try again." }, { status: 400 });
  }

  const missingNote = input.decisions.find((d) => d.decision === "CHANGES_REQUESTED" && !d.note);
  if (missingNote) {
    return NextResponse.json(
      { success: false, error: "Please add a note for each post that needs changes." },
      { status: 400 }
    );
  }

  // Only posts on this link that are still waiting on a decision
  const pending = new Map(
    approval.posts.filter((p) => p.approvalStatus === "PENDING").map((p) => [p.id, p])
  );
  const applicable = input.decisions.filter((d) => pending.has(d.postId));
  if (applicable.length === 0) {
    return NextResponse.json(
      { success: false, error: "These posts have already been reviewed. Thank you!" },
      { status: 409 }
    );
  }

  const results: Array<{ postId: string; decision: string; movedToDraft: boolean }> = [];
  for (const d of applicable) {
    const post = pending.get(d.postId)!;
    // Guarded on approvalId + PENDING so a revoked link or a concurrent submit can't write
    const { count } = await prisma.contentPost.updateMany({
      where: { id: post.id, approvalId: approval.id, approvalStatus: "PENDING" },
      data: {
        approvalStatus: d.decision,
        approvalNote: d.note || null,
      },
    });
    if (count !== 1) continue;

    // Don't let a post the client wants changed go out on schedule
    let movedToDraft = false;
    if (d.decision === "CHANGES_REQUESTED") {
      const moved = await prisma.contentPost.updateMany({
        where: { id: post.id, status: "SCHEDULED" },
        data: { status: "DRAFT" },
      });
      movedToDraft = moved.count === 1;
    }
    results.push({ postId: post.id, decision: d.decision, movedToDraft });
  }

  if (results.length === 0) {
    return NextResponse.json(
      { success: false, error: "These posts have already been reviewed. Thank you!" },
      { status: 409 }
    );
  }

  const stillPending = await prisma.contentPost.count({
    where: { approvalId: approval.id, approvalStatus: "PENDING" },
  });
  await prisma.contentApproval.update({
    where: { id: approval.id },
    data: { respondedAt: new Date(), ...(stillPending === 0 ? { status: "RESPONDED" } : {}) },
  });

  const approved = results.filter((r) => r.decision === "APPROVED").length;
  const changes = results.length - approved;
  const who = input.name || approval.client.name;
  const summary = [
    approved ? `${approved} approved` : null,
    changes ? `${changes} need${changes === 1 ? "s" : ""} changes` : null,
  ]
    .filter(Boolean)
    .join(", ");

  await prisma.activityLog
    .create({
      data: {
        clientId: approval.clientId,
        actor: who,
        action: "content_approval_response",
        details: `Client reviewed ${results.length} post${results.length === 1 ? "" : "s"}${approval.title ? ` in "${approval.title}"` : ""}: ${summary}`,
      },
    })
    .catch(() => {});

  // One notification per person: the assignees of the reviewed posts, or the owners
  const owners = (await prisma.user.findMany({ where: { role: "OWNER", isActive: true }, select: { id: true } })).map((u) => u.id);
  const byRecipient = new Map<string, typeof results>();
  for (const r of results) {
    const assignee = pending.get(r.postId)?.assignedToId;
    for (const userId of assignee ? [assignee] : owners) {
      byRecipient.set(userId, [...(byRecipient.get(userId) || []), r]);
    }
  }
  for (const [userId, rs] of byRecipient) {
    const firstChange = rs.find((r) => r.decision === "CHANGES_REQUESTED");
    const a = rs.filter((r) => r.decision === "APPROVED").length;
    const c = rs.length - a;
    await notifyUser({
      userId,
      type: "approval_response",
      clientId: approval.clientId,
      title: c > 0 ? `${approval.client.name} asked for changes` : `${approval.client.name} approved posts`,
      body: [a ? `${a} approved` : null, c ? `${c} need${c === 1 ? "s" : ""} changes (moved back to draft)` : null]
        .filter(Boolean)
        .join(", "),
      link: `/content?post=${(firstChange || rs[0]).postId}`,
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, data: { results, stillPending } });
}
