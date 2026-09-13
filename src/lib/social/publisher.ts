import type { ContentPost, Credential } from "@prisma/client";
import { ensureFreshToken } from "@/lib/oauth/refresh";
import { decrypt } from "@/lib/encryption";
import prisma from "@/lib/prisma";
import type {
  CredentialMeta,
  NormalizedMetrics,
  PlatformAdapter,
  PostContent,
  PublishStep,
  ResolvedCredential,
} from "./types";
import { PublishValidationError } from "./types";
import { resolvePostMedia } from "./renditions";
import { twitterAdapter } from "./platforms/twitter";
import { linkedinAdapter } from "./platforms/linkedin";
import { facebookAdapter } from "./platforms/facebook";
import { threadsAdapter } from "./platforms/threads";
import { instagramAdapter } from "./platforms/instagram";
import { tiktokAdapter } from "./platforms/tiktok";
import { youtubeAdapter } from "./platforms/youtube";

export type { PostContent } from "./types";

/** Strip tokens/keys from error messages to prevent credential leakage in logs */
export function sanitizePublishError(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]")
    .replace(/access_token[=:]\s*[^\s,}&]*/gi, "access_token=[REDACTED]")
    .replace(/token[=:]\s*["']?[A-Za-z0-9\-._~+/]{20,}["']?/gi, "token=[REDACTED]")
    .replace(/key[=:]\s*["']?[A-Za-z0-9\-._~+/]{20,}["']?/gi, "key=[REDACTED]");
}

/** Result shape of the single-shot legacy publishers (X, LinkedIn, Facebook, Threads). */
export interface PublishResult {
  success: boolean;
  externalId?: string;
  externalUrl?: string;
  error?: string;
}

export interface DecryptedCredential {
  username: string;
  password: string;
  notes: string | null;
}

const ADAPTERS: Partial<Record<ContentPost["platform"], PlatformAdapter>> = {
  TWITTER: twitterAdapter,
  LINKEDIN: linkedinAdapter,
  FACEBOOK: facebookAdapter,
  THREADS: threadsAdapter,
  INSTAGRAM: instagramAdapter,
  TIKTOK: tiktokAdapter,
  YOUTUBE: youtubeAdapter,
  // REDNOTE has no publishing API: those posts are always ASSISTED.
};

export function getAdapter(platform: ContentPost["platform"]): PlatformAdapter | undefined {
  return ADAPTERS[platform];
}

const PLATFORM_ALIASES: Record<string, string[]> = {
  INSTAGRAM: ["instagram", "meta", "facebook"],
  FACEBOOK: ["facebook", "meta"],
  TWITTER: ["twitter", "x", "x.com"],
  LINKEDIN: ["linkedin"],
  TIKTOK: ["tiktok"],
  THREADS: ["threads"],
  YOUTUBE: ["youtube", "google"],
  REDNOTE: ["rednote", "xiaohongshu"],
};

export function findCredential(credentials: Credential[], platform: string): Credential | undefined {
  const aliases = PLATFORM_ALIASES[platform] || [platform.toLowerCase()];
  // Prefer an exact platform name so "Instagram" wins over a "Facebook" row
  const exact = credentials.find((c) => c.platform.toLowerCase() === aliases[0]);
  return exact || credentials.find((c) => aliases.some((alias) => c.platform.toLowerCase().includes(alias)));
}

function decryptCredential(credential: Credential): ResolvedCredential {
  const ivData: Record<string, string | null> = JSON.parse(credential.iv);
  if (!ivData.username || !ivData.password) {
    throw new Error("Credential data corrupted — missing IV fields");
  }
  return {
    id: credential.id,
    username: decrypt(credential.username, ivData.username),
    password: decrypt(credential.password, ivData.password),
    notes: credential.notes && ivData.notes ? decrypt(credential.notes, ivData.notes) : null,
    meta: (credential.meta as CredentialMeta | null) ?? null,
  };
}

/**
 * Load the post's connection, refreshing the token first when it's about to
 * expire (re-reading the row afterwards so the new token is the one used).
 */
export async function resolveCredentialForPost(
  post: Pick<ContentPost, "clientId" | "credentialId" | "platform">
): Promise<ResolvedCredential> {
  const credentials = post.credentialId
    ? await prisma.credential.findMany({ where: { id: post.credentialId } })
    : await prisma.credential.findMany({ where: { clientId: post.clientId } });

  let credential = post.credentialId
    ? credentials.find((c) => c.id === post.credentialId) || findCredential(credentials, post.platform)
    : findCredential(credentials, post.platform);

  if (!credential) {
    throw new Error(`No ${post.platform} account is connected for this client. Connect one on the client page.`);
  }

  if (credential.url) {
    const refreshed = await ensureFreshToken(credential.id).catch(() => false);
    if (refreshed) {
      credential = (await prisma.credential.findUnique({ where: { id: credential.id } })) || credential;
    }
  }

  return decryptCredential(credential);
}

export function buildPostContent(post: ContentPost): PostContent {
  const pdfUrl = post.mediaUrls.find((u) => /\.pdf$/i.test(u));
  const settings = (post.platformSettings as Record<string, unknown>) || {};
  return {
    title: post.title || "",
    body: post.body || "",
    hashtags: post.hashtags,
    mediaUrls: post.mediaUrls.filter((u) => !/\.pdf$/i.test(u)),
    documentUrl: pdfUrl,
    documentTitle: (settings.documentTitle as string) || post.title || "Document",
  };
}

/** Run one step of a post's publish. Called repeatedly by the runner until done. */
export async function runPublishStep(
  post: ContentPost,
  state: Record<string, unknown> | null,
  deadline: number
): Promise<PublishStep> {
  const adapter = getAdapter(post.platform);
  if (!adapter) {
    throw new Error(`${post.platform} can't be published automatically. Switch this post to "Post manually".`);
  }

  const credential = await resolveCredentialForPost(post);

  // Formatted media (9:16 with black bars, etc.) is rendered by the render
  // cron. Wait for every copy before the first real step, and hand the
  // adapter the copies on every step so a resumed upload reads the same file.
  let content = buildPostContent(post);
  let adapterState = state;
  const media = await resolvePostMedia(post);
  if (media.status === "failed") {
    throw new PublishValidationError(`Couldn't format the media: ${media.error}`);
  }
  if (media.status === "pending") {
    if (state && !state.__waitingForMedia) {
      throw new Error("The formatted media for this post changed mid-publish. Check the account before retrying.");
    }
    return { kind: "continue", phase: "processing", state: { __waitingForMedia: true }, retryAfterMs: 30_000 };
  }
  content = { ...content, mediaUrls: media.urls };
  if (state?.__waitingForMedia) adapterState = null;

  return adapter.publish({
    post,
    credential,
    content,
    settings: (post.platformSettings as Record<string, unknown>) || {},
    state: adapterState,
    deadline,
  });
}

/** Fetch stats for published posts that share one credential. */
export async function fetchMetricsForPosts(
  platform: ContentPost["platform"],
  credential: ResolvedCredential,
  posts: Pick<ContentPost, "id" | "externalId" | "platformSettings" | "publishedAt">[]
): Promise<Record<string, NormalizedMetrics>> {
  const adapter = getAdapter(platform);
  if (!adapter?.fetchMetrics) return {};
  return adapter.fetchMetrics(credential, posts);
}
