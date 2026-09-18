/**
 * Contract between the publish runner and each platform adapter.
 *
 * Publishing is a resumable state machine. The runner calls adapter.publish()
 * with state=null the first time, then again with whatever state the adapter
 * returned, on later cron runs, until it returns { kind: "done" }.
 *
 * Double-post rule for adapters: right after any remote call that CREATES
 * something that can't be created twice safely (TikTok init, YouTube upload
 * session, IG media_publish...), return { kind: "continue" } with the id in
 * state so the runner persists it before doing more work. A step that crashes
 * before persisting is failed by the runner, never blindly repeated.
 */

import type { ContentPost } from "@prisma/client";

export interface CredentialMeta {
  /** OAuth provider key from src/lib/oauth/config.ts (meta, instagram, tiktok, google, ...) */
  provider?: string;
  /** Platform-side account id (IG user id, TikTok open_id, YouTube channel id) */
  accountId?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  /** Instagram: "graph.facebook.com" (Facebook Login) or "graph.instagram.com" (Instagram Login) */
  apiHost?: string;
  scopes?: string[];
  /** ISO timestamp; refresh token expiry where the provider reports it (TikTok) */
  refreshExpiresAt?: string;
}

export interface ResolvedCredential {
  id: string;
  /** Account id for API calls (IG user id, page id, open_id, channel id) */
  username: string;
  /** Current access token */
  password: string;
  /** Refresh token, where stored */
  notes: string | null;
  meta: CredentialMeta | null;
}

export interface PostContent {
  title: string;
  body: string;
  hashtags: string[];
  mediaUrls: string[];
  documentUrl?: string;
  documentTitle?: string;
}

export type PublishPhase = "uploading" | "processing";

export type PublishStep =
  | { kind: "done"; externalId?: string; externalUrl?: string }
  /**
   * The API's part is finished but a person has to finish the post in the app
   * (TikTok drafts). The runner moves the post to ACTION_NEEDED and notifies
   * whoever is assigned, exactly like a manual post that came due.
   */
  | { kind: "handoff"; externalId?: string; notice: { title: string; body: string } }
  | {
      kind: "continue";
      phase: PublishPhase;
      state: Record<string, unknown>;
      /** Earliest time the runner should call back (default 20s) */
      retryAfterMs?: number;
    };

export interface PublishContext {
  post: ContentPost;
  credential: ResolvedCredential;
  content: PostContent;
  settings: Record<string, unknown>;
  /** null on the first call; afterwards the state from the previous step */
  state: Record<string, unknown> | null;
  /** Epoch ms. Chunked work must stop and return "continue" before this. */
  deadline: number;
}

export interface NormalizedMetrics {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  reach?: number | null;
  raw?: Record<string, unknown>;
}

export interface PlatformAdapter {
  publish(ctx: PublishContext): Promise<PublishStep>;
  /**
   * Stats for published posts on one credential, keyed by post.externalId.
   * Missing keys = no data this round (not an error).
   */
  fetchMetrics?(
    credential: ResolvedCredential,
    posts: Pick<ContentPost, "id" | "externalId" | "platformSettings" | "publishedAt">[]
  ): Promise<Record<string, NormalizedMetrics>>;
  /**
   * Optional: how long before scheduledAt the runner may start this post
   * (YouTube uploads early as private with a native publishAt). 0 / undefined
   * means start at the scheduled time.
   */
  leadTimeMs?(post: ContentPost): number;
  /**
   * Optional: undo an in-progress publish so the post can be edited or deleted
   * (e.g. YouTube uploaded ahead as private with a future publishAt).
   * cancelled:false means it's already live or can't be pulled; message says why.
   */
  cancel?(ctx: {
    post: ContentPost;
    credential: ResolvedCredential;
    state: Record<string, unknown> | null;
  }): Promise<{ cancelled: boolean; message?: string }>;
}

/** Thrown for problems the user must fix (bad media, missing setting); message is shown as-is. */
export class PublishValidationError extends Error {}
