/**
 * Comments on posts the scheduler published to Instagram, read live from the
 * platform (nothing is stored). Uses the comment permission the connections
 * already hold for the auto first comment.
 *
 * Only Instagram: TikTok has no comments API, and a post marked as posted by
 * hand has no platform id to look up.
 */

import type { ContentPost } from "@prisma/client";
import prisma from "@/lib/prisma";
import { resolveCredentialForPost } from "./publisher";
import { graph } from "./platforms/instagram";
import type { ResolvedCredential } from "./types";

const LOOKBACK_DAYS = 45;
const MAX_POSTS = 20;
const PARALLEL = 4;

export interface InboxReply {
  id: string;
  text: string;
  username: string;
  timestamp: string;
  /** Written from the connected account itself */
  own: boolean;
}

export interface InboxComment extends InboxReply {
  likeCount: number;
  replies: InboxReply[];
  /** The account has already replied under this comment */
  answered: boolean;
}

export interface InboxPost {
  postId: string;
  clientId: string;
  clientName: string;
  account: string | null;
  caption: string;
  publishedAt: string | null;
  externalUrl: string | null;
  comments: InboxComment[];
  /** Why this post's comments couldn't be read, if they couldn't */
  error?: string;
}

interface RawComment {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  like_count?: number;
  replies?: { data?: RawComment[] };
}

type PostRow = Pick<ContentPost, "id" | "clientId" | "credentialId" | "platform" | "externalId" | "title" | "body" | "publishedAt" | "externalUrl"> & {
  client: { name: string };
};

async function commentsFor(post: PostRow, credential: ResolvedCredential): Promise<InboxComment[]> {
  const own = (credential.meta?.username || "").toLowerCase();
  const res = await graph<{ data?: RawComment[] }>(credential, "GET", `${post.externalId}/comments`, {
    fields: "id,text,username,timestamp,like_count,replies{id,text,username,timestamp}",
    limit: "50",
  });
  const isOwn = (c: RawComment) => !!own && (c.username || "").toLowerCase() === own;
  return (res.data || [])
    .filter((c) => !isOwn(c)) // our own first comment isn't something to answer
    .map((c) => {
      const replies = (c.replies?.data || [])
        .map((r) => ({ id: r.id, text: r.text || "", username: r.username || "", timestamp: r.timestamp || "", own: isOwn(r) }))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      return {
        id: c.id,
        text: c.text || "",
        username: c.username || "",
        timestamp: c.timestamp || "",
        own: false,
        likeCount: c.like_count || 0,
        replies,
        answered: replies.some((r) => r.own),
      };
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function listInstagramComments(clientId?: string | null): Promise<InboxPost[]> {
  // Cast: Prisma's include type inference is broken repo-wide
  const posts = (await prisma.contentPost.findMany({
    where: {
      ...(clientId ? { clientId } : {}),
      platform: "INSTAGRAM",
      status: "PUBLISHED",
      externalId: { not: null },
      publishedAt: { gte: new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000) },
    },
    include: { client: { select: { name: true } } },
    orderBy: { publishedAt: "desc" },
    take: MAX_POSTS,
  })) as unknown as PostRow[];

  // One token lookup (and refresh) per connection, not per post
  const credentials = new Map<string, Promise<ResolvedCredential>>();
  const credentialFor = (post: PostRow) => {
    const key = post.credentialId || `client:${post.clientId}`;
    if (!credentials.has(key)) credentials.set(key, resolveCredentialForPost(post));
    return credentials.get(key)!;
  };

  const out: InboxPost[] = new Array(posts.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < posts.length) {
      const i = cursor++;
      const post = posts[i];
      const base = {
        postId: post.id,
        clientId: post.clientId,
        clientName: post.client.name,
        caption: (post.title || post.body || "").replace(/\s+/g, " ").slice(0, 140),
        publishedAt: post.publishedAt?.toISOString() ?? null,
        externalUrl: post.externalUrl,
      };
      try {
        const credential = await credentialFor(post);
        out[i] = { ...base, account: credential.meta?.username || null, comments: await commentsFor(post, credential) };
      } catch (err) {
        out[i] = { ...base, account: null, comments: [], error: err instanceof Error ? err.message.slice(0, 200) : "Couldn't read the comments." };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, posts.length) }, worker));
  return out;
}

/** Reply under a comment as the connected account. Returns the new reply's id. */
export async function replyToInstagramComment(postId: string, commentId: string, message: string): Promise<string> {
  const post = await prisma.contentPost.findUnique({
    where: { id: postId },
    select: { id: true, clientId: true, credentialId: true, platform: true, status: true, externalId: true },
  });
  if (!post || post.platform !== "INSTAGRAM" || post.status !== "PUBLISHED" || !post.externalId) {
    throw new Error("That post isn't a published Instagram post.");
  }
  const credential = await resolveCredentialForPost(post);
  // Sent exactly once: a retry after a lost response would post the reply twice
  const res = await graph<{ id?: string }>(credential, "POST", `${commentId}/replies`, { message });
  return res.id || "";
}
