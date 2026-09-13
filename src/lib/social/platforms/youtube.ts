/**
 * YouTube publishing (Shorts + regular videos) via the Data API v3 resumable
 * upload protocol, split across runner steps so large files never sit in
 * memory and a crash never uploads a second copy.
 *
 * Steps:
 *  1. (state null) check the upload quota, open a resumable session with the
 *     metadata, and hand the session URL back to the runner right away.
 *  2. "uploading": ask YouTube for the current offset (so a step that died
 *     mid-chunk is safe to repeat), then send ~64 MiB chunks read by byte
 *     range from Blob until the step's deadline.
 *  3. "processing": with the video id saved, set the thumbnail and playlist
 *     (failures are warnings, never a failed post), then either finish or wait
 *     until the scheduled time when it was uploaded ahead as private with a
 *     native publishAt.
 */

import type { ContentPost } from "@prisma/client";
import prisma from "@/lib/prisma";
import type { NormalizedMetrics, PlatformAdapter, PublishContext, PublishStep, ResolvedCredential } from "../types";
import { PublishValidationError } from "../types";
import { fetchRange, getRemoteSize, guessVideoContentType, isVideoUrl } from "../media";
import { fetchWithRetry } from "../http";
import {
  buildYouTubeDescription,
  looksLikePlaylistId,
  readYouTubeSettings,
  YOUTUBE_LIMITS,
  youtubeSpec,
} from "../specs/youtube";
import { assertUploadFits, recordYouTubeUsage, unitsFit, YOUTUBE_UNIT_COST } from "../youtube-quota";

const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3";

/** Chunks must be multiples of 256 KiB (except the last). 256 KiB × 256 = 64 MiB. */
const CHUNK_BYTES = 256 * 1024 * 256;
/** Leave this much of the step budget unused so the runner can save state. */
const SAFETY_MS = 45_000;
/**
 * How early to start a public scheduled upload (YouTube then publishes it on
 * time via publishAt). Kept short: once started, the post is locked until it
 * goes live or is cancelled. 20 min base + ~1 min per 50 MB, capped at 3h;
 * 60 min when the file size isn't known up front.
 */
const LEAD_BASE_MS = 20 * 60 * 1000;
const LEAD_PER_50MB_MS = 60 * 1000;
const LEAD_UNKNOWN_SIZE_MS = 60 * 60 * 1000;
const LEAD_MAX_MS = 3 * 60 * 60 * 1000;
/** videos.delete quota cost (Data API units) */
const VIDEOS_DELETE_UNITS = 50;
/** Only use native scheduling when the go-live time is at least this far off. */
const NATIVE_SCHEDULE_MIN_MS = 10 * 60 * 1000;
const MAX_CHUNK_FAILURES = 5;

interface UploadState {
  uploadUrl: string;
  mediaUrl: string;
  total: number;
  /** null = unknown, ask YouTube before sending */
  offset: number | null;
  postType: "short" | "video";
  /** ISO; set when uploaded as private with a native publishAt */
  publishAt?: string | null;
  failures?: number;
  videoId?: string;
  finalized?: boolean;
}

function authHeaders(credential: ResolvedCredential, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${credential.password}`, ...extra };
}

async function logWarning(post: ContentPost, details: string): Promise<void> {
  await prisma.activityLog
    .create({
      data: { clientId: post.clientId, actor: "publisher", action: "content_publish_warning", details },
    })
    .catch(() => {});
}

async function apiError(res: Response, what: string): Promise<Error> {
  const text = await res.text().catch(() => "");
  let reason = text.slice(0, 400);
  try {
    const body = JSON.parse(text);
    const first = body?.error?.errors?.[0];
    reason = [body?.error?.message, first?.reason].filter(Boolean).join(" / ") || reason;
  } catch {
    // keep raw text
  }
  if (res.status === 401) {
    return new Error(`YouTube rejected the connection while ${what} (401). Reconnect the channel on the client page.`);
  }
  if (/quotaExceeded|uploadLimitExceeded/i.test(reason)) {
    return new PublishValidationError(`YouTube quota or channel upload limit reached while ${what}: ${reason}. Try again after midnight Pacific time.`);
  }
  return new Error(`YouTube API error while ${what} (${res.status}): ${reason}`);
}

function watchUrl(videoId: string, postType: "short" | "video"): string {
  return postType === "short" ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`;
}

/** Step 1: validate, check quota, open the resumable session. */
async function startUpload(ctx: PublishContext): Promise<PublishStep> {
  const { post, credential, content } = ctx;
  const settings = readYouTubeSettings(ctx.settings);

  const mediaUrl = content.mediaUrls.find(isVideoUrl) || content.mediaUrls[0];
  if (!mediaUrl) {
    throw new PublishValidationError("YouTube posts need a video. Add one and reschedule.");
  }

  const postType = ((ctx.settings.postType as string) || youtubeSpec.defaultPostType({
    media: [{ url: mediaUrl, kind: "video" }],
  })) === "short" ? "short" : "video";

  const title = (content.title || "").trim();
  if (!title) throw new PublishValidationError("YouTube requires a title. Add one and reschedule.");
  if (settings.madeForKids === null) {
    throw new PublishValidationError("Choose whether this video is made for kids (YouTube requires it), then reschedule.");
  }

  const description = buildYouTubeDescription(content.body, content.hashtags);
  if (Buffer.byteLength(description, "utf8") > YOUTUBE_LIMITS.descriptionBytes) {
    throw new PublishValidationError(`The description is longer than YouTube's ${YOUTUBE_LIMITS.descriptionBytes}-byte limit. Shorten it and reschedule.`);
  }

  await assertUploadFits();

  const total = await getRemoteSize(mediaUrl);

  // Upload ahead as private and let YouTube flip it public exactly on time
  const scheduledAt = post.scheduledAt?.getTime() ?? 0;
  const nativeSchedule =
    settings.privacyStatus === "public" && scheduledAt - Date.now() > NATIVE_SCHEDULE_MIN_MS;
  const publishAt = nativeSchedule ? new Date(scheduledAt).toISOString() : null;

  const metadata = {
    snippet: {
      title: title.slice(0, YOUTUBE_LIMITS.title),
      description,
      tags: settings.tags.length ? settings.tags : undefined,
      categoryId: settings.categoryId,
    },
    status: {
      privacyStatus: nativeSchedule ? "private" : settings.privacyStatus,
      ...(publishAt ? { publishAt } : {}),
      selfDeclaredMadeForKids: settings.madeForKids,
      containsSyntheticMedia: settings.containsSyntheticMedia,
      embeddable: true,
    },
  };

  const params = new URLSearchParams({ uploadType: "resumable", part: "snippet,status" });
  if (!settings.notifySubscribers) params.set("notifySubscribers", "false");

  const res = await fetch(`${UPLOAD_API}/videos?${params}`, {
    method: "POST",
    headers: authHeaders(credential, {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(total),
      "X-Upload-Content-Type": guessVideoContentType(mediaUrl),
    }),
    body: JSON.stringify(metadata),
  });
  if (!res.ok) throw await apiError(res, "starting the upload");

  const uploadUrl = res.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube didn't return an upload session URL.");

  // videos.insert bills its own bucket when the call is made
  await recordYouTubeUsage({ uploads: 1 });

  const state: UploadState = { uploadUrl, mediaUrl, total, offset: 0, postType, publishAt, failures: 0 };
  return { kind: "continue", phase: "uploading", state: state as unknown as Record<string, unknown>, retryAfterMs: 0 };
}

/** Parse a finished upload response into the video id. */
async function videoIdFrom(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  const id = body?.id as string | undefined;
  if (!id) throw new Error("YouTube finished the upload but didn't return a video id. Check the channel before retrying.");
  return id;
}

/**
 * Ask YouTube how much it has. Returns the next byte offset, or the video id if
 * the upload already completed (e.g. a step died after the last chunk landed).
 */
async function queryOffset(state: UploadState, credential: ResolvedCredential): Promise<number | { videoId: string }> {
  // A status query changes nothing on YouTube's side, so it's safe to retry
  const res = await fetchWithRetry(
    state.uploadUrl,
    {
      method: "PUT",
      headers: authHeaders(credential, { "Content-Length": "0", "Content-Range": `bytes */${state.total}` }),
    },
    { idempotent: true }
  );
  if (res.status === 200 || res.status === 201) return { videoId: await videoIdFrom(res) };
  if (res.status === 308) {
    const range = res.headers.get("range"); // "bytes=0-12345"
    await res.body?.cancel();
    const end = range ? Number(range.split("-")[1]) : -1;
    return Number.isFinite(end) ? end + 1 : 0;
  }
  if (res.status === 404 || res.status === 410) {
    throw new Error("The YouTube upload session expired before it finished. Nothing was published; reschedule to try again.");
  }
  throw await apiError(res, "checking upload progress");
}

async function continueUpload(ctx: PublishContext, state: UploadState): Promise<PublishStep> {
  const { credential } = ctx;
  const next = (s: UploadState, retryAfterMs = 0): PublishStep => ({
    kind: "continue",
    phase: s.videoId ? "processing" : "uploading",
    state: s as unknown as Record<string, unknown>,
    retryAfterMs,
  });

  // Always start from YouTube's own offset: the saved one is stale if the
  // previous step died after sending a chunk but before its state was saved
  const current = await queryOffset(state, credential);
  if (typeof current === "object") return next({ ...state, offset: state.total, videoId: current.videoId });
  let offset = current;

  while (offset < state.total) {
    if (Date.now() > ctx.deadline - SAFETY_MS) {
      return next({ ...state, offset });
    }

    const end = Math.min(offset + CHUNK_BYTES, state.total) - 1;
    const chunk = await fetchRange(state.mediaUrl, offset, end);

    let res: Response;
    try {
      res = await fetch(state.uploadUrl, {
        method: "PUT",
        headers: authHeaders(credential, {
          "Content-Length": String(chunk.byteLength),
          "Content-Range": `bytes ${offset}-${end}/${state.total}`,
          "Content-Type": guessVideoContentType(state.mediaUrl),
        }),
        body: new Uint8Array(chunk),
      });
    } catch (err) {
      // Network drop mid-chunk: re-ask YouTube for the offset next step
      const failures = (state.failures || 0) + 1;
      if (failures > MAX_CHUNK_FAILURES) throw err;
      return next({ ...state, offset: null, failures }, 30_000);
    }

    if (res.status === 308) {
      const range = res.headers.get("range");
      await res.body?.cancel();
      offset = range ? Number(range.split("-")[1]) + 1 : 0;
      continue;
    }
    if (res.status === 200 || res.status === 201) {
      const videoId = await videoIdFrom(res);
      // Persist the id before doing anything else (double-post rule)
      return next({ ...state, offset: state.total, videoId, failures: 0 });
    }
    if (res.status >= 500) {
      await res.body?.cancel();
      const failures = (state.failures || 0) + 1;
      if (failures > MAX_CHUNK_FAILURES) throw await apiError(res, "uploading");
      return next({ ...state, offset: null, failures }, 30_000);
    }
    if (res.status === 404 || res.status === 410) {
      throw new Error("The YouTube upload session expired before it finished. Nothing was published; reschedule to try again.");
    }
    throw await apiError(res, "uploading");
  }

  // Offset says we're done but we never saw the final response: ask
  const status = await queryOffset(state, credential);
  if (typeof status === "object") return next({ ...state, offset: state.total, videoId: status.videoId });
  return next({ ...state, offset: status }, 5_000);
}

async function setThumbnail(ctx: PublishContext, videoId: string): Promise<void> {
  const { post, credential } = ctx;
  const thumbUrl = post.thumbnailUrl || post.coverImageUrl;
  if (!thumbUrl) return;

  try {
    if (!(await unitsFit(YOUTUBE_UNIT_COST.thumbnailsSet))) {
      await logWarning(post, `YouTube thumbnail skipped for "${post.title || "(untitled)"}": today's API quota is used up.`);
      return;
    }
    const img = await fetchWithRetry(thumbUrl);
    if (!img.ok) throw new Error(`couldn't read the image (${img.status})`);
    const type = img.headers.get("content-type") || (/\.png(\?|$)/i.test(thumbUrl) ? "image/png" : "image/jpeg");
    if (!/image\/(jpeg|png)/.test(type)) throw new Error("thumbnails must be JPG or PNG");
    const bytes = Buffer.from(await img.arrayBuffer());
    if (bytes.byteLength > YOUTUBE_LIMITS.thumbnailBytes) throw new Error("the image is over YouTube's 2MB thumbnail limit");

    const res = await fetch(`${UPLOAD_API}/thumbnails/set?videoId=${encodeURIComponent(videoId)}`, {
      method: "POST",
      headers: authHeaders(credential, { "Content-Type": type, "Content-Length": String(bytes.byteLength) }),
      body: new Uint8Array(bytes),
    });
    await recordYouTubeUsage({ units: YOUTUBE_UNIT_COST.thumbnailsSet });
    if (!res.ok) throw await apiError(res, "setting the thumbnail");
  } catch (err) {
    await logWarning(
      post,
      `YouTube video for "${post.title || "(untitled)"}" published without its custom thumbnail: ${(err as Error).message}. Custom thumbnails need a verified channel.`
    );
  }
}

async function addToPlaylist(ctx: PublishContext, videoId: string): Promise<void> {
  const { post, credential } = ctx;
  const { playlistId } = readYouTubeSettings(ctx.settings);
  if (!playlistId) return;
  if (!looksLikePlaylistId(playlistId)) {
    await logWarning(post, `YouTube video for "${post.title || "(untitled)"}" wasn't added to a playlist: "${playlistId}" isn't a playlist id.`);
    return;
  }

  try {
    const cost = YOUTUBE_UNIT_COST.playlistItemsList + YOUTUBE_UNIT_COST.playlistItemsInsert;
    if (!(await unitsFit(cost))) throw new Error("today's API quota is used up");

    // A retried step must not add the video twice
    const existing = await fetchWithRetry(
      `${API}/playlistItems?part=id&maxResults=1&playlistId=${encodeURIComponent(playlistId)}&videoId=${encodeURIComponent(videoId)}`,
      { headers: authHeaders(credential) }
    );
    await recordYouTubeUsage({ units: YOUTUBE_UNIT_COST.playlistItemsList });
    if (existing.ok) {
      const body = await existing.json();
      if ((body.items || []).length > 0) return;
    }

    const res = await fetch(`${API}/playlistItems?part=snippet`, {
      method: "POST",
      headers: authHeaders(credential, { "Content-Type": "application/json" }),
      body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } }),
    });
    await recordYouTubeUsage({ units: YOUTUBE_UNIT_COST.playlistItemsInsert });
    if (!res.ok) throw await apiError(res, "adding to the playlist");
  } catch (err) {
    await logWarning(post, `YouTube video for "${post.title || "(untitled)"}" wasn't added to the playlist: ${(err as Error).message}`);
  }
}

/** Thumbnail + playlist, then finish (or wait for the native go-live time). */
async function finalize(ctx: PublishContext, state: UploadState): Promise<PublishStep> {
  const videoId = state.videoId!;

  if (!state.finalized) {
    await setThumbnail(ctx, videoId);
    await addToPlaylist(ctx, videoId);
    state = { ...state, finalized: true };
  }

  // Uploaded ahead as private: keep the post "in progress" until YouTube's
  // publishAt passes so the calendar doesn't call it published early.
  if (state.publishAt) {
    const waitMs = new Date(state.publishAt).getTime() - Date.now();
    if (waitMs > 0) {
      return {
        kind: "continue",
        phase: "processing",
        state: state as unknown as Record<string, unknown>,
        retryAfterMs: Math.min(waitMs, 30 * 60 * 1000),
      };
    }
  }

  return { kind: "done", externalId: videoId, externalUrl: watchUrl(videoId, state.postType) };
}

export const youtubeAdapter: PlatformAdapter = {
  leadTimeMs(post) {
    if (!post.scheduledAt) return 0;
    const settings = post.platformSettings as Record<string, unknown> | null;
    const { privacyStatus } = readYouTubeSettings(settings);
    if (privacyStatus !== "public") return 0;
    // Optional size hint (bytes) saved with the post; unknown sizes get a flat hour
    const bytes = Number(settings?.mediaBytes);
    if (!Number.isFinite(bytes) || bytes <= 0) return LEAD_UNKNOWN_SIZE_MS;
    return Math.min(LEAD_BASE_MS + Math.ceil(bytes / (50 * 1024 * 1024)) * LEAD_PER_50MB_MS, LEAD_MAX_MS);
  },

  async cancel({ post, credential, state: raw }) {
    const state = raw as UploadState | null;
    // Nothing reached YouTube yet
    if (!state?.uploadUrl) return { cancelled: true };

    let videoId = state.videoId;
    if (!videoId) {
      try {
        const status = await queryOffset(state, credential);
        if (typeof status === "object") videoId = status.videoId;
      } catch {
        // Session expired: nothing was created
      }
      // An unfinished upload session creates no video; abandoning it is enough
      if (!videoId) return { cancelled: true, message: "The upload was stopped before it finished. Nothing was published." };
    }

    const res = await fetchWithRetry(`${API}/videos?part=status&id=${encodeURIComponent(videoId)}`, {
      headers: authHeaders(credential),
    });
    await recordYouTubeUsage({ units: YOUTUBE_UNIT_COST.videosList });
    if (!res.ok) throw await apiError(res, "checking the video before cancelling");
    const item = (await res.json()).items?.[0];
    if (!item) return { cancelled: true, message: "The video is no longer on the channel." };

    const privacy = item.status?.privacyStatus as string | undefined;
    const publishAt = item.status?.publishAt as string | undefined;
    const waitingToGoLive = privacy === "private" && !!publishAt && Date.parse(publishAt) > Date.now();
    if (!waitingToGoLive) {
      return {
        cancelled: false,
        message:
          privacy === "private"
            ? "The video is already uploaded as private on YouTube. Delete it in YouTube Studio if it shouldn't stay there."
            : "The video is already live on YouTube. Remove it in YouTube Studio.",
      };
    }

    if (!(await unitsFit(VIDEOS_DELETE_UNITS))) {
      return { cancelled: false, message: "Today's YouTube API quota is used up, so the scheduled video can't be removed automatically. Delete it in YouTube Studio before it goes live." };
    }
    const del = await fetch(`${API}/videos?id=${encodeURIComponent(videoId)}`, {
      method: "DELETE",
      headers: authHeaders(credential),
    });
    await recordYouTubeUsage({ units: VIDEOS_DELETE_UNITS });
    if (!del.ok && del.status !== 404) throw await apiError(del, "removing the scheduled video");

    await logWarning(post, `Scheduled YouTube video for "${post.title || "(untitled)"}" was removed from the channel before going live (cancelled in the tracker).`);
    return { cancelled: true, message: "The scheduled video was removed from YouTube before it went live." };
  },

  async publish(ctx) {
    const state = ctx.state as UploadState | null;
    if (!state || !state.uploadUrl) return startUpload(ctx);
    if (state.videoId) return finalize(ctx, state);
    return continueUpload(ctx, state);
  },

  async fetchMetrics(credential, posts) {
    const ids = [...new Set(posts.map((p) => p.externalId).filter((id): id is string => !!id))];
    const out: Record<string, NormalizedMetrics> = {};

    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      if (!(await unitsFit(YOUTUBE_UNIT_COST.videosList))) break;
      const res = await fetchWithRetry(`${API}/videos?part=statistics&id=${batch.map(encodeURIComponent).join(",")}`, {
        headers: authHeaders(credential),
      });
      await recordYouTubeUsage({ units: YOUTUBE_UNIT_COST.videosList });
      if (!res.ok) throw await apiError(res, "fetching stats");

      const body = await res.json();
      for (const item of body.items || []) {
        const s = item.statistics || {};
        const num = (v: unknown) => (v === undefined || v === null ? null : Number(v));
        out[item.id] = {
          views: num(s.viewCount),
          likes: num(s.likeCount),
          comments: num(s.commentCount),
          raw: s,
        };
      }
    }

    return out;
  },
};
