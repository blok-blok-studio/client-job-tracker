/**
 * X (Twitter) publishing on the current v2 API (api.x.com).
 *
 * Auth: OAuth 2.0 user token (tweet.write, media.write, offline.access).
 * Cost: X moved to pay-per-use in Feb 2026; every created post spends credits
 * from the developer account, so "credits depleted" errors are explained.
 *
 * Media, one runner step at a time:
 *  - images/GIF (up to 4 images, or 1 GIF) upload one-shot to /2/media/upload
 *  - one video uploads in chunks (initialize → append 4 MB segments →
 *    finalize), resuming across runs, then waits for processing
 * Finalizing hands back before the post is created, so a crash after the post
 * goes out can't re-run the upload and post it again. Thread replies (settings.threadPosts) go out one per
 * step with the chain saved between them, so a crash can't repeat a reply.
 *
 * Settings: threadPosts (string[]), pollOptions (string[]), pollDuration
 * (minutes), quoteTweetUrl.
 */

import type { DecryptedCredential, PublishResult } from "../publisher";
import { fetchRange, getRemoteSize, guessVideoContentType, isVideoUrl } from "../media";
import { fetchWithRetry } from "../http";
import {
  PublishValidationError,
  type PlatformAdapter,
  type PostContent,
  type PublishContext,
  type PublishStep,
} from "../types";

const API = "https://api.x.com/2";
const MAX_WEIGHTED_LENGTH = 280;
const CHUNK_BYTES = 4 * 1024 * 1024; // docs: keep segments at or below 5 MB
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * X's weighted length: URLs count 23, most Latin/punctuation ranges count 1,
 * everything else (CJK, emoji) counts 2.
 */
export function weightedLength(text: string): number {
  const withoutUrls = text.replace(/https?:\/\/\S+/g, "");
  const urlCount = (text.match(/https?:\/\/\S+/g) || []).length;
  let length = urlCount * 23;
  for (const ch of withoutUrls) {
    const cp = ch.codePointAt(0)!;
    const light =
      (cp >= 0 && cp <= 4351) || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247);
    length += light ? 1 : 2;
  }
  return length;
}

function tweetText(content: PostContent): string {
  const tags = content.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  return [content.body, tags].filter(Boolean).join("\n\n");
}

function xError(action: string, status: number, body: Record<string, unknown>): Error {
  const detail =
    (body.detail as string) ||
    ((body.errors as { message?: string }[] | undefined)?.[0]?.message as string) ||
    (body.title as string) ||
    `HTTP ${status}`;
  let hint = "";
  if (status === 401) hint = " The X connection expired or was revoked. Reconnect X on the client page.";
  else if (status === 402 || /credit|client-not-enrolled|payment/i.test(detail)) {
    hint = " The X developer account is out of API credits or not on pay-per-use. Add credits in the X developer console.";
  } else if (status === 403 && /duplicate/i.test(detail)) hint = " X rejects posts identical to a recent one.";
  else if (status === 429) hint = " X rate limit hit. Try again in 15 minutes.";
  return new Error(`X ${action} failed: ${detail}.${hint}`);
}

async function xJson(
  method: "GET" | "POST",
  path: string,
  token: string,
  action: string,
  body?: unknown
): Promise<Record<string, unknown>> {
  // GETs (status checks) retry on transient errors; POSTs create things and go out once
  const res = await fetchWithRetry(`${API}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw xError(action, res.status, json);
  return json;
}

async function xMultipart(path: string, token: string, form: FormData, action: string, opts: { idempotent?: boolean } = {}) {
  const res = await fetchWithRetry(
    `${API}/${path}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
    { idempotent: opts.idempotent === true }
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw xError(action, res.status, json);
  return json;
}

type ProcessingInfo = { state?: string; check_after_secs?: number; error?: { message?: string } };

interface XState {
  mediaIds?: string[];
  /** media ids still processing (GIFs, video) */
  pending?: string[];
  video?: { id: string; url: string; total: number; offset: number; segment: number };
  tweetIds?: string[];
  nextReply?: number;
  checkAfterMs?: number;
}

function quoteId(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  return url.match(/status(?:es)?\/(\d+)/)?.[1];
}

async function uploadImage(url: string, token: string): Promise<{ id: string; processing?: ProcessingInfo }> {
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`Couldn't read an image for X (${res.status}). Re-upload it and try again.`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const isGif = /\.gif(\?|#|$)/i.test(url);
  if (!isGif && bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new PublishValidationError("X images must be 5 MB or smaller.");
  }
  const form = new FormData();
  form.append("media", new Blob([new Uint8Array(bytes)]), url.split("/").pop()?.split("?")[0] || "image");
  form.append("media_category", isGif ? "tweet_gif" : "tweet_image");
  const json = await xMultipart("media/upload", token, form, "image upload");
  const data = json.data as { id: string; processing_info?: ProcessingInfo };
  return { id: String(data.id), processing: data.processing_info };
}

async function createPost(
  content: PostContent,
  settings: Record<string, unknown>,
  token: string,
  state: XState
): Promise<PublishStep> {
  const body: Record<string, unknown> = { text: tweetText(content) };
  if (state.mediaIds?.length) body.media = { media_ids: state.mediaIds };
  const options = Array.isArray(settings.pollOptions) ? (settings.pollOptions as string[]).filter(Boolean) : [];
  if (options.length >= 2) {
    body.poll = { options, duration_minutes: Number(settings.pollDuration) || 1440 };
  }
  const quote = quoteId(settings.quoteTweetUrl);
  if (quote) body.quote_tweet_id = quote;

  const json = await xJson("POST", "tweets", token, "post", body);
  const id = String((json.data as { id: string }).id);
  const replies = Array.isArray(settings.threadPosts) ? (settings.threadPosts as string[]).filter((t) => t?.trim()) : [];
  if (replies.length === 0) return { kind: "done", externalId: id };
  // Save the post id before posting replies (double-post rule)
  return { kind: "continue", phase: "processing", state: { ...state, tweetIds: [id], nextReply: 0 }, retryAfterMs: 0 };
}

async function publishStep(
  content: PostContent,
  credential: { password: string; meta?: { username?: string } | null },
  settings: Record<string, unknown>,
  state: XState | null,
  deadline: number
): Promise<PublishStep> {
  const token = credential.password;
  const username = credential.meta?.username;
  const link = (id: string) => (username ? `https://x.com/${username}/status/${id}` : `https://x.com/i/status/${id}`);

  // ─── Thread replies ─────────────────────────────────────────────────────────
  if (state?.tweetIds?.length) {
    const replies = Array.isArray(settings.threadPosts) ? (settings.threadPosts as string[]).filter((t) => t?.trim()) : [];
    const next = state.nextReply ?? 0;
    const first = state.tweetIds[0];
    if (next >= replies.length) return { kind: "done", externalId: first, externalUrl: link(first) };
    const json = await xJson("POST", "tweets", token, `thread reply ${next + 1}`, {
      text: replies[next],
      reply: { in_reply_to_tweet_id: state.tweetIds[state.tweetIds.length - 1] },
    });
    const tweetIds = [...state.tweetIds, String((json.data as { id: string }).id)];
    if (next + 1 >= replies.length) return { kind: "done", externalId: first, externalUrl: link(first) };
    return { kind: "continue", phase: "processing", state: { ...state, tweetIds, nextReply: next + 1 }, retryAfterMs: 0 };
  }

  // ─── Chunked video upload in progress ──────────────────────────────────────
  if (state?.video && state.video.offset < state.video.total) {
    const video = { ...state.video };
    while (video.offset < video.total && Date.now() < deadline - 20_000) {
      const end = Math.min(video.offset + CHUNK_BYTES, video.total) - 1;
      const chunk = await fetchRange(video.url, video.offset, end);
      const form = new FormData();
      form.append("segment_index", String(video.segment));
      form.append("media", new Blob([new Uint8Array(chunk)]), "chunk");
      // An append names its segment_index, so re-sending the same segment replaces it
      await xMultipart(`media/upload/${video.id}/append`, token, form, "video upload", { idempotent: true });
      video.offset = end + 1;
      video.segment++;
    }
    if (video.offset < video.total) {
      return { kind: "continue", phase: "uploading", state: { ...state, video }, retryAfterMs: 0 };
    }
    const json = await xJson("POST", `media/upload/${video.id}/finalize`, token, "video finalize");
    const info = (json.data as { processing_info?: ProcessingInfo })?.processing_info;
    // Hand back before creating the post: the upload is done and must never be
    // re-run. The processing branch checks status (instant if nothing to wait
    // for) and then creates the post.
    return {
      kind: "continue",
      phase: "processing",
      state: { ...state, video, mediaIds: [video.id], pending: [video.id] },
      retryAfterMs: info && info.state !== "succeeded" ? (info.check_after_secs || 5) * 1000 : 0,
    };
  }

  // ─── Waiting on media processing ───────────────────────────────────────────
  if (state?.pending?.length) {
    let wait = 0;
    for (const id of state.pending) {
      const json = await xJson("GET", `media/upload?command=STATUS&media_id=${id}`, token, "media status check");
      const info = (json.data as { processing_info?: ProcessingInfo })?.processing_info;
      if (info?.state === "failed") {
        throw new Error(`X couldn't process the media: ${info.error?.message || "processing failed"}`);
      }
      if (info && info.state !== "succeeded") wait = Math.max(wait, (info.check_after_secs || 5) * 1000);
    }
    if (wait > 0) return { kind: "continue", phase: "processing", state: { ...state }, retryAfterMs: wait };
    const step = await createPost(content, settings, token, { ...state, pending: [] });
    return step.kind === "done" ? { ...step, externalUrl: link(step.externalId!) } : step;
  }

  // ─── First step: validate, upload images or start the video ────────────────
  const text = tweetText(content);
  if (weightedLength(text) > MAX_WEIGHTED_LENGTH) {
    throw new PublishValidationError(
      `X posts are limited to ${MAX_WEIGHTED_LENGTH} characters (links count as 23). This one is ${weightedLength(text)}.`
    );
  }
  const videos = content.mediaUrls.filter(isVideoUrl);
  const images = content.mediaUrls.filter((u) => !isVideoUrl(u));
  const gifs = images.filter((u) => /\.gif(\?|#|$)/i.test(u));
  const options = Array.isArray(settings.pollOptions) ? (settings.pollOptions as string[]).filter(Boolean) : [];

  if (videos.length > 1 || (videos.length === 1 && images.length > 0)) {
    throw new PublishValidationError("An X post can have one video or up to 4 images, not both.");
  }
  if (images.length > 4) throw new PublishValidationError("An X post can have up to 4 images.");
  if (gifs.length > 0 && images.length > 1) throw new PublishValidationError("A GIF has to be the only image on an X post.");
  if (options.length >= 2 && content.mediaUrls.length > 0) {
    throw new PublishValidationError("X polls can't include images or video.");
  }
  if (!text && content.mediaUrls.length === 0) throw new PublishValidationError("An X post needs text or media.");

  if (videos.length === 1) {
    const url = videos[0];
    const total = await getRemoteSize(url);
    const json = await xJson("POST", "media/upload/initialize", token, "video upload start", {
      media_type: guessVideoContentType(url),
      total_bytes: total,
      media_category: "tweet_video",
    });
    const id = String((json.data as { id: string }).id);
    return {
      kind: "continue",
      phase: "uploading",
      state: { video: { id, url, total, offset: 0, segment: 0 } },
      retryAfterMs: 0,
    };
  }

  // Uploaded media that never gets attached simply expires, so this is safe to redo
  const mediaIds: string[] = [];
  const pending: string[] = [];
  for (const url of images) {
    const { id, processing } = await uploadImage(url, token);
    mediaIds.push(id);
    if (processing && processing.state !== "succeeded") pending.push(id);
  }
  if (pending.length) {
    return { kind: "continue", phase: "processing", state: { mediaIds, pending }, retryAfterMs: 5_000 };
  }
  const step = await createPost(content, settings, token, { mediaIds });
  return step.kind === "done" ? { ...step, externalUrl: link(step.externalId!) } : step;
}

export const twitterAdapter: PlatformAdapter = {
  publish(ctx: PublishContext) {
    return publishStep(ctx.content, ctx.credential, ctx.settings, ctx.state as XState | null, ctx.deadline);
  },
};

/**
 * Legacy single-call entry point, kept until publisher.ts registers
 * twitterAdapter. Runs every step inline.
 */
export async function publishToTwitter(
  content: PostContent,
  credential: DecryptedCredential
): Promise<PublishResult> {
  let state: XState | null = null;
  const giveUpAt = Date.now() + 270_000;
  for (;;) {
    const step = await publishStep(content, credential, {}, state, giveUpAt);
    if (step.kind === "done") return { success: true, externalId: step.externalId, externalUrl: step.externalUrl };
    if (Date.now() > giveUpAt) throw new Error("X is still processing the upload. Check the account before retrying.");
    state = step.state as XState;
    await new Promise((r) => setTimeout(r, step.retryAfterMs ?? 5_000));
  }
}
