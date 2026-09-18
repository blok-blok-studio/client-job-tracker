/**
 * TikTok Content Posting API: Direct Post, and upload to the creator's inbox
 * as a draft (settings.tiktokDraft) so sounds and effects can be added in the
 * app before it goes live.
 *
 * Videos go up with FILE_UPLOAD in sequential chunks straight from Blob, so no
 * domain verification is needed. Photo carousels only support PULL_FROM_URL,
 * so their images are served through our signed media proxy
 * (/api/social/media/<token>), whose URL prefix must be verified in the TikTok
 * developer portal.
 *
 * Steps (see the double-post rule in ../types.ts):
 *   init (creates the publish on TikTok)  → persist publishId
 *   uploading (video only, chunk by chunk) → persist nextChunk
 *   processing (poll status/fetch)         → done
 *
 * Drafts run the same steps against the inbox endpoints and end in a handoff
 * once TikTok says the draft reached the creator's inbox.
 */

import { createHmac, timingSafeEqual } from "crypto";
import prisma from "@/lib/prisma";
import { fetchRange, getRemoteSize, guessVideoContentType, isVideoUrl } from "../media";
import {
  PublishValidationError,
  type NormalizedMetrics,
  type PlatformAdapter,
  type PublishContext,
  type PublishStep,
  type ResolvedCredential,
} from "../types";
import {
  TIKTOK_BRANDED_PRIVATE_NOTICE,
  TIKTOK_MAX_PHOTOS,
  TIKTOK_PHOTO_DESCRIPTION_MAX,
  TIKTOK_TITLE_MAX,
  TIKTOK_VIDEO_CAPTION_MAX,
  tiktokCaption,
} from "../specs/tiktok";

const API = "https://open.tiktokapis.com/v2";
/** Chunks we send. TikTok allows 5–64MB (last chunk up to 128MB); 16MB keeps memory low. */
const CHUNK_SIZE = 16 * 1024 * 1024;
const MIN_CHUNK = 5 * 1024 * 1024;
/** upload_url is valid for one hour; stop trusting it a little earlier. */
const UPLOAD_URL_TTL_MS = 55 * 60 * 1000;
/** Leave room to persist state before the runner's deadline. */
const DEADLINE_MARGIN_MS = 25_000;
const MAX_INIT_RETRIES = 5;
/** Media proxy links TikTok pulls photos from stay valid this long. */
const MEDIA_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// ─── API helpers ─────────────────────────────────────────────────────────

class TikTokApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

async function tiktokPost<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code?: string; message?: string } };
  const code = json.error?.code || (res.ok ? "ok" : `http_${res.status}`);
  if (!res.ok || code !== "ok") {
    throw new TikTokApiError(code, json.error?.message || `TikTok API error (${res.status})`, res.status);
  }
  return json.data as T;
}

/** Turn TikTok error codes into messages a teammate can act on. */
function explain(err: unknown): Error {
  if (!(err instanceof TikTokApiError)) return err instanceof Error ? err : new Error(String(err));
  switch (err.code) {
    case "unaudited_client_can_only_post_to_private_accounts":
      return new PublishValidationError(
        "TikTok hasn't approved this app yet (audit pending), so it can only post to private accounts with visibility set to Only me. Post this one manually, or wait for the audit."
      );
    case "privacy_level_option_mismatch":
      return new PublishValidationError("That visibility option isn't available for this TikTok account anymore. Pick another and reschedule.");
    case "spam_risk_too_many_posts":
      return new PublishValidationError("This TikTok account hit its daily posting limit. Reschedule for tomorrow.");
    case "spam_risk_user_banned_from_posting":
      return new PublishValidationError("TikTok has blocked this account from posting right now.");
    case "reached_active_user_cap":
      return new PublishValidationError("The TikTok app hit its daily active user cap. Try again tomorrow.");
    case "url_ownership_unverified":
      return new PublishValidationError(
        "TikTok couldn't pull the photos because the media link prefix isn't verified in the TikTok developer portal."
      );
    case "spam_risk_too_many_pending_share":
      return new PublishValidationError("This TikTok account already has 5 drafts from us waiting in its inbox from the last 24 hours. Post or delete one in the TikTok app, then reschedule.");
    case "access_token_invalid":
    case "scope_not_authorized":
      return new Error(`TikTok connection needs a reconnect (${err.code}).`);
    default:
      return new Error(`TikTok API error (${err.code}): ${err.message}`);
  }
}

export interface TikTokCreatorInfo {
  username: string;
  nickname: string;
  avatarUrl: string | null;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number | null;
}

/** Latest creator settings. TikTok requires calling this before every post UI and publish. */
export async function queryCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
  try {
    const d = await tiktokPost<{
      creator_username?: string;
      creator_nickname?: string;
      creator_avatar_url?: string;
      privacy_level_options?: string[];
      comment_disabled?: boolean;
      duet_disabled?: boolean;
      stitch_disabled?: boolean;
      max_video_post_duration_sec?: number;
    }>("/post/publish/creator_info/query/", accessToken, {});
    return {
      username: d.creator_username || "",
      nickname: d.creator_nickname || "",
      avatarUrl: d.creator_avatar_url || null,
      privacyLevelOptions: d.privacy_level_options || [],
      commentDisabled: !!d.comment_disabled,
      duetDisabled: !!d.duet_disabled,
      stitchDisabled: !!d.stitch_disabled,
      maxVideoPostDurationSec: d.max_video_post_duration_sec ?? null,
    };
  } catch (err) {
    throw explain(err);
  }
}

// ─── Signed media proxy links (photo PULL_FROM_URL) ─────────────────────

function mediaSigningSecret(): string {
  const secret = process.env.TIKTOK_MEDIA_SIGNING_SECRET || process.env.CRON_SECRET;
  if (!secret) throw new Error("TIKTOK_MEDIA_SIGNING_SECRET (or CRON_SECRET) must be set to post TikTok photos");
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", mediaSigningSecret()).update(payload).digest("base64url");
}

export function createMediaToken(blobUrl: string, ttlMs = MEDIA_TOKEN_TTL_MS): string {
  const payload = Buffer.from(JSON.stringify({ u: blobUrl, e: Date.now() + ttlMs })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The Blob URL a media token points at, or null if it's forged or expired. */
export function readMediaToken(token: string): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as { u?: string; e?: number };
    if (typeof u !== "string" || typeof e !== "number" || e < Date.now()) return null;
    return u;
  } catch {
    return null;
  }
}

function mediaProxyUrl(blobUrl: string): string {
  const base = (process.env.TIKTOK_MEDIA_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("NEXT_PUBLIC_APP_URL (or TIKTOK_MEDIA_BASE_URL) must be set to post TikTok photos");
  return `${base}/api/social/media/${createMediaToken(blobUrl)}`;
}

// ─── Publishing ─────────────────────────────────────────────────────────

interface TikTokState {
  kind?: "video" | "photo";
  /** Sent to the creator's TikTok inbox as a draft instead of posted */
  draft?: boolean;
  publishId?: string;
  uploadUrl?: string;
  uploadUrlExpiresAt?: number;
  total?: number;
  chunkSize?: number;
  totalChunks?: number;
  nextChunk?: number;
  contentType?: string;
  initRetries?: number;
  /** Carried for the progress bar in the planner */
  offset?: number;
}

function flag(settings: Record<string, unknown>, key: string): boolean {
  return settings[key] === true;
}

/** Validate settings against live creator info; returns the post_info shared by both post types. */
async function checkCreatorAndBuildPostInfo(ctx: PublishContext, isVideo: boolean) {
  const { settings, credential } = ctx;
  const creator = await queryCreatorInfo(credential.password);

  const privacy = settings.privacyLevel as string | undefined;
  if (!privacy) throw new PublishValidationError("Choose who can view this TikTok before it can post.");
  if (!creator.privacyLevelOptions.includes(privacy)) {
    throw new PublishValidationError("That visibility option isn't available for this TikTok account anymore. Pick another and reschedule.");
  }
  if (flag(settings, "brandedContent") && privacy === "SELF_ONLY") {
    throw new PublishValidationError(TIKTOK_BRANDED_PRIVATE_NOTICE);
  }

  return {
    creator,
    postInfo: {
      privacy_level: privacy,
      // Interactions are off unless the user turned them on, and forced off when the creator disabled them
      disable_comment: !flag(settings, "allowComment") || creator.commentDisabled,
      ...(isVideo
        ? {
            disable_duet: !flag(settings, "allowDuet") || creator.duetDisabled,
            disable_stitch: !flag(settings, "allowStitch") || creator.stitchDisabled,
          }
        : {}),
      brand_content_toggle: flag(settings, "brandedContent"),
      brand_organic_toggle: flag(settings, "brandOrganic"),
    },
  };
}

/**
 * Duration of the video being posted. A formatted copy's URL isn't in the
 * library, so follow it back to its source file.
 */
async function findVideoDuration(videoUrl: string): Promise<{ duration: number | null } | null> {
  const direct = await prisma.clientMedia.findFirst({ where: { url: videoUrl }, select: { duration: true } });
  if (direct?.duration != null) return direct;

  const rendition = await prisma.mediaRendition.findFirst({
    where: { url: videoUrl },
    select: { sourceMediaId: true, sourceUrl: true },
  });
  if (!rendition) return direct;
  return prisma.clientMedia.findFirst({
    where: rendition.sourceMediaId ? { id: rendition.sourceMediaId } : { url: rendition.sourceUrl },
    select: { duration: true },
  });
}

async function startVideo(ctx: PublishContext, state: TikTokState): Promise<PublishStep> {
  const { content, settings, credential } = ctx;
  const videoUrl = content.mediaUrls.find(isVideoUrl);
  if (!videoUrl || content.mediaUrls.length !== 1) {
    throw new PublishValidationError("A TikTok video post needs exactly one video.");
  }

  const draft = flag(settings, "tiktokDraft");
  // A draft carries no post settings: privacy, caption and the rest are set in the app
  const { creator, postInfo } = draft ? { creator: await queryCreatorInfo(credential.password), postInfo: null } : await checkCreatorAndBuildPostInfo(ctx, true);

  const media = await findVideoDuration(videoUrl);
  if (media?.duration != null && creator.maxVideoPostDurationSec != null && media.duration > creator.maxVideoPostDurationSec) {
    throw new PublishValidationError(
      `This account can post videos up to ${creator.maxVideoPostDurationSec} seconds; this one is ${Math.round(media.duration)}.`
    );
  }

  const caption = tiktokCaption(content.body || content.title, content.hashtags);
  if (!draft && caption.length > TIKTOK_VIDEO_CAPTION_MAX) {
    throw new PublishValidationError(`TikTok captions max out at ${TIKTOK_VIDEO_CAPTION_MAX} characters including hashtags.`);
  }

  // Chunk plan per the media transfer guide: under 5MB is one chunk; otherwise
  // total_chunk_count = floor(size / chunk_size) and the last chunk takes the remainder.
  const total = await getRemoteSize(videoUrl);
  if (total > 4 * 1024 * 1024 * 1024) throw new PublishValidationError("TikTok accepts video files up to 4GB.");
  const chunkSize = total < MIN_CHUNK ? total : Math.min(CHUNK_SIZE, total);
  const totalChunks = Math.max(1, Math.floor(total / chunkSize));

  let init: { publish_id: string; upload_url: string };
  try {
    const sourceInfo = { source: "FILE_UPLOAD", video_size: total, chunk_size: chunkSize, total_chunk_count: totalChunks };
    init = draft
      ? await tiktokPost("/post/publish/inbox/video/init/", credential.password, { source_info: sourceInfo })
      : await tiktokPost("/post/publish/video/init/", credential.password, {
          post_info: {
            ...postInfo,
            title: caption,
            ...(typeof settings.videoCoverTimestampMs === "number" ? { video_cover_timestamp_ms: settings.videoCoverTimestampMs } : {}),
            is_aigc: flag(settings, "isAigc"),
          },
          source_info: sourceInfo,
        });
  } catch (err) {
    return retryInitOrThrow(err, state);
  }

  // The publish now exists on TikTok: persist before sending any bytes.
  return {
    kind: "continue",
    phase: "uploading",
    retryAfterMs: 0,
    state: {
      kind: "video",
      draft,
      publishId: init.publish_id,
      uploadUrl: init.upload_url,
      uploadUrlExpiresAt: Date.now() + UPLOAD_URL_TTL_MS,
      total,
      chunkSize,
      totalChunks,
      nextChunk: 0,
      offset: 0,
      contentType: guessVideoContentType(videoUrl),
    },
  };
}

async function startPhotos(ctx: PublishContext, state: TikTokState): Promise<PublishStep> {
  const { content, settings, credential } = ctx;
  const photos = content.mediaUrls;
  if (photos.length === 0 || photos.some(isVideoUrl)) {
    throw new PublishValidationError("A TikTok photo post needs photos only (no videos).");
  }
  if (photos.length > TIKTOK_MAX_PHOTOS) {
    throw new PublishValidationError(`TikTok allows up to ${TIKTOK_MAX_PHOTOS} photos per post.`);
  }
  if (photos.some((u) => !/\.(jpe?g|webp)(\?|#|$)/i.test(u))) {
    throw new PublishValidationError("TikTok only accepts JPEG or WebP photos.");
  }

  const draft = flag(settings, "tiktokDraft");
  const { postInfo } = draft ? { postInfo: null } : await checkCreatorAndBuildPostInfo(ctx, false);
  const title = (content.title || "").slice(0, TIKTOK_TITLE_MAX);
  const description = tiktokCaption(content.body, content.hashtags);
  if (description.length > TIKTOK_PHOTO_DESCRIPTION_MAX) {
    throw new PublishValidationError(`TikTok photo descriptions max out at ${TIKTOK_PHOTO_DESCRIPTION_MAX} characters including hashtags.`);
  }
  const coverIndex = typeof settings.photoCoverIndex === "number" ? settings.photoCoverIndex : 0;

  let init: { publish_id: string };
  try {
    init = await tiktokPost("/post/publish/content/init/", credential.password, {
      media_type: "PHOTO",
      post_mode: draft ? "MEDIA_UPLOAD" : "DIRECT_POST",
      post_info: draft ? { title, description } : { ...postInfo, title, description, auto_add_music: flag(settings, "autoAddMusic") },
      source_info: {
        source: "PULL_FROM_URL",
        photo_cover_index: Math.min(Math.max(0, coverIndex), photos.length - 1),
        photo_images: photos.map(mediaProxyUrl),
      },
      ...(draft ? {} : { is_aigc: flag(settings, "isAigc") }),
    });
  } catch (err) {
    return retryInitOrThrow(err, state);
  }

  return { kind: "continue", phase: "processing", retryAfterMs: 10_000, state: { kind: "photo", draft, publishId: init.publish_id } };
}

/** Init creates nothing when it's rate limited, so it's safe to try again a minute later. */
function retryInitOrThrow(err: unknown, state: TikTokState): PublishStep {
  const retries = state.initRetries || 0;
  if (err instanceof TikTokApiError && err.code === "rate_limit_exceeded" && retries < MAX_INIT_RETRIES) {
    return { kind: "continue", phase: "uploading", retryAfterMs: 65_000, state: { initRetries: retries + 1 } };
  }
  if (err instanceof TikTokApiError && err.code === "rate_limit_exceeded") {
    throw new Error("TikTok kept rate limiting this account (6 post requests per minute). Nothing was posted; reschedule to try again.");
  }
  throw explain(err);
}

async function uploadChunks(ctx: PublishContext, state: TikTokState): Promise<PublishStep> {
  const { uploadUrl, uploadUrlExpiresAt, total, chunkSize, totalChunks, contentType } = state;
  if (!uploadUrl || !total || !chunkSize || !totalChunks) throw new Error("TikTok upload state is incomplete");
  const videoUrl = ctx.content.mediaUrls.find(isVideoUrl);
  if (!videoUrl) throw new Error("The video for this TikTok post is gone");

  let next = state.nextChunk || 0;
  while (next < totalChunks) {
    if (Date.now() > ctx.deadline - DEADLINE_MARGIN_MS) {
      return { kind: "continue", phase: "uploading", retryAfterMs: 0, state: { ...state, nextChunk: next, offset: next * chunkSize } };
    }
    if (!uploadUrlExpiresAt || Date.now() > uploadUrlExpiresAt) {
      throw new Error("TikTok's upload link expired before the video finished uploading. Nothing was posted; reschedule to try again.");
    }

    const start = next * chunkSize;
    const end = next === totalChunks - 1 ? total - 1 : start + chunkSize - 1;
    const bytes = await fetchRange(videoUrl, start, end);

    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType || "video/mp4",
        "Content-Length": String(bytes.length),
        "Content-Range": `bytes ${start}-${end}/${total}`,
      },
      body: new Uint8Array(bytes),
    });
    if (res.status !== 206 && res.status !== 201 && !res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      throw new Error(`TikTok chunk upload failed (${res.status}) at bytes ${start}-${end}. ${detail}`);
    }
    next++;
  }

  return { kind: "continue", phase: "processing", retryAfterMs: 10_000, state: { ...state, nextChunk: next, offset: total } };
}

async function pollStatus(ctx: PublishContext, state: TikTokState): Promise<PublishStep> {
  let data: { status?: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] };
  try {
    data = await tiktokPost("/post/publish/status/fetch/", ctx.credential.password, { publish_id: state.publishId });
  } catch (err) {
    // Status checks are read-only; a hiccup just means ask again next run
    if (err instanceof TikTokApiError && (err.code === "rate_limit_exceeded" || err.status >= 500)) {
      return { kind: "continue", phase: "processing", retryAfterMs: 30_000, state: state as Record<string, unknown> };
    }
    throw explain(err);
  }

  // A draft is finished on our side once it lands in the creator's inbox. If
  // they were quick and already posted it, fall through to PUBLISH_COMPLETE.
  if (state.draft && data.status === "SEND_TO_USER_INBOX") {
    return {
      kind: "handoff",
      externalId: state.publishId,
      notice: {
        title: "A draft is waiting in TikTok",
        body: "Open TikTok, tap the Inbox notification, add the sound and the caption, then post it.",
      },
    };
  }

  if (data.status === "PUBLISH_COMPLETE") {
    const publicId = data.publicaly_available_post_id?.[0];
    const username = ctx.credential.meta?.username;
    const path = state.kind === "photo" ? "photo" : "video";
    return {
      kind: "done",
      externalId: publicId != null ? String(publicId) : state.publishId,
      externalUrl: publicId != null && username ? `https://www.tiktok.com/@${username}/${path}/${publicId}` : undefined,
    };
  }
  if (data.status === "FAILED") {
    throw new Error(`TikTok couldn't publish it (${data.fail_reason || "unknown reason"}).`);
  }
  return { kind: "continue", phase: "processing", retryAfterMs: 10_000, state: state as Record<string, unknown> };
}

async function publish(ctx: PublishContext): Promise<PublishStep> {
  const state = (ctx.state || {}) as TikTokState;

  if (!state.publishId) {
    const postType = (ctx.settings.postType as string) || (ctx.content.mediaUrls.some(isVideoUrl) ? "video" : "photo");
    return postType === "photo" ? startPhotos(ctx, state) : startVideo(ctx, state);
  }
  if (state.kind === "video" && (state.nextChunk || 0) < (state.totalChunks || 0)) {
    return uploadChunks(ctx, state);
  }
  return pollStatus(ctx, state);
}

// ─── Metrics ─────────────────────────────────────────────────────────────

async function fetchMetrics(
  credential: ResolvedCredential,
  posts: { externalId: string | null }[]
): Promise<Record<string, NormalizedMetrics>> {
  // Only public post ids are queryable; a stored publish_id (private post) isn't a video id
  const ids = [...new Set(posts.map((p) => p.externalId).filter((id): id is string => !!id && /^\d+$/.test(id)))];
  const out: Record<string, NormalizedMetrics> = {};

  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20);
    const data = await tiktokPost<{
      videos?: { id: string; view_count?: number; like_count?: number; comment_count?: number; share_count?: number }[];
    }>("/video/query/?fields=id,view_count,like_count,comment_count,share_count", credential.password, {
      filters: { video_ids: batch },
    }).catch((err) => {
      throw explain(err);
    });
    for (const v of data.videos || []) {
      out[String(v.id)] = {
        views: v.view_count ?? null,
        likes: v.like_count ?? null,
        comments: v.comment_count ?? null,
        shares: v.share_count ?? null,
        raw: v as unknown as Record<string, unknown>,
      };
    }
  }
  return out;
}

export const tiktokAdapter: PlatformAdapter = {
  publish,
  fetchMetrics,
};
