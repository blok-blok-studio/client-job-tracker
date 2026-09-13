/**
 * Facebook Pages publishing (Graph API).
 *
 * Posts go out with a PAGE access token. Credentials connected before Sept
 * 2026 hold the user token instead, which is why Page videos failed with
 * "(#100) No permission to publish the video"; for those we derive the Page
 * token at publish time (works once the connection has pages_manage_posts).
 *
 * Supported: text (+ optional link), one photo, multiple photos, one video.
 * Videos are pulled by Facebook from the Blob URL (file_url), then we wait for
 * processing across runner steps. The video id is saved before waiting, so a
 * crash mid-wait can never upload it twice.
 *
 * Settings: link (string) — attached to text posts.
 */

import type { DecryptedCredential, PublishResult } from "../publisher";
import { isVideoUrl } from "../media";
import { fetchWithRetry } from "../http";
import {
  PublishValidationError,
  type PlatformAdapter,
  type PostContent,
  type PublishContext,
  type PublishStep,
} from "../types";

const GRAPH = "https://graph.facebook.com/v25.0";
/** Photos attached to one multi-photo post; kept conservative. */
const MAX_PHOTOS = 10;

function caption(content: PostContent): string {
  const tags = content.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  return [content.body, tags].filter(Boolean).join("\n\n");
}

/** Turn a Graph error into something the team can act on. */
function explain(action: string, status: number, error: { message?: string; code?: number } | undefined): Error {
  const message = error?.message || `HTTP ${status}`;
  let hint = "";
  if (error?.code === 190) hint = " The Facebook connection expired. Reconnect the Page on the client page.";
  else if (error?.code === 100 || error?.code === 200 || /permission/i.test(message)) {
    hint = " Reconnect the Page on the client page so the tracker gets the pages_manage_posts permission and a Page token.";
  }
  return new Error(`Facebook ${action} failed: ${message}.${hint}`);
}

/** Creates/publishes: sent exactly once, never retried. */
async function graphPost(path: string, params: Record<string, string>, action: string) {
  const res = await fetch(`${GRAPH}/${path}`, { method: "POST", body: new URLSearchParams(params) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw explain(action, res.status, json.error);
  return json;
}

/** Reads: retried on transient errors so one hiccup can't fail a half-published post. */
async function graphGet(path: string, params: Record<string, string>, action: string) {
  const res = await fetchWithRetry(`${GRAPH}/${path}?${new URLSearchParams(params)}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw explain(action, res.status, json.error);
  return json;
}

/** The Page token for this Page; falls back to the stored token if it already is one. */
async function pageToken(pageId: string, token: string): Promise<string> {
  try {
    const res = await fetchWithRetry(`${GRAPH}/${pageId}?${new URLSearchParams({ fields: "access_token", access_token: token })}`);
    const json = await res.json();
    if (res.ok && typeof json.access_token === "string") return json.access_token;
  } catch {
    // fall through
  }
  return token;
}

async function permalink(id: string, token: string): Promise<string | undefined> {
  try {
    const json = await graphGet(id, { fields: "permalink_url", access_token: token }, "permalink lookup");
    const url = json.permalink_url as string | undefined;
    if (!url) return undefined;
    return url.startsWith("http") ? url : `https://www.facebook.com${url}`;
  } catch {
    return undefined;
  }
}

interface FacebookState {
  videoId?: string;
}

async function publishStep(
  content: PostContent,
  credential: { username: string; password: string },
  settings: Record<string, unknown>,
  state: FacebookState | null
): Promise<PublishStep> {
  const pageId = credential.username;
  const token = await pageToken(pageId, credential.password);
  const message = caption(content);

  // ─── Waiting on a video that's already uploaded ─────────────────────────────
  if (state?.videoId) {
    const json = await graphGet(state.videoId, { fields: "status,permalink_url", access_token: token }, "video status check");
    const videoStatus = json.status?.video_status as string | undefined;
    if (videoStatus === "error" || videoStatus === "expired") {
      const detail =
        json.status?.processing_phase?.errors?.[0]?.message ||
        json.status?.uploading_phase?.errors?.[0]?.message ||
        videoStatus;
      throw new Error(`Facebook couldn't process the video: ${detail}`);
    }
    if (videoStatus === "ready") {
      const url = json.permalink_url as string | undefined;
      return {
        kind: "done",
        externalId: state.videoId,
        externalUrl: url ? (url.startsWith("http") ? url : `https://www.facebook.com${url}`) : undefined,
      };
    }
    return { kind: "continue", phase: "processing", state: { ...state }, retryAfterMs: 20_000 };
  }

  const videos = content.mediaUrls.filter(isVideoUrl);
  const photos = content.mediaUrls.filter((u) => !isVideoUrl(u));

  if (videos.length > 1 || (videos.length === 1 && photos.length > 0)) {
    throw new PublishValidationError("A Facebook post can have one video or up to 10 photos, not both.");
  }
  if (photos.length > MAX_PHOTOS) {
    throw new PublishValidationError(`A Facebook post can have up to ${MAX_PHOTOS} photos. This one has ${photos.length}.`);
  }

  // ─── Video ──────────────────────────────────────────────────────────────────
  if (videos.length === 1) {
    const params: Record<string, string> = {
      file_url: videos[0],
      description: message,
      access_token: token,
    };
    if (content.title) params.title = content.title;
    const json = await graphPost(`${pageId}/videos`, params, "video upload");
    // Persist the id before waiting on processing (double-post rule)
    return { kind: "continue", phase: "processing", state: { videoId: String(json.id) }, retryAfterMs: 20_000 };
  }

  // ─── One photo ──────────────────────────────────────────────────────────────
  if (photos.length === 1) {
    const json = await graphPost(`${pageId}/photos`, { url: photos[0], message, access_token: token }, "photo post");
    const postId = String(json.post_id || json.id);
    return { kind: "done", externalId: postId, externalUrl: await permalink(postId, token) };
  }

  // ─── Several photos: upload unpublished, then one post attaching them ──────
  if (photos.length > 1) {
    const photoIds: string[] = [];
    for (const url of photos) {
      // Unpublished photos that never get attached are invisible and harmless
      const json = await graphPost(`${pageId}/photos`, { url, published: "false", access_token: token }, "photo upload");
      photoIds.push(String(json.id));
    }
    const params: Record<string, string> = { message, access_token: token };
    photoIds.forEach((id, i) => {
      params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
    });
    const json = await graphPost(`${pageId}/feed`, params, "multi-photo post");
    const postId = String(json.id);
    return { kind: "done", externalId: postId, externalUrl: await permalink(postId, token) };
  }

  // ─── Text (optionally with a link) ──────────────────────────────────────────
  if (!message && typeof settings.link !== "string") {
    throw new PublishValidationError("A Facebook post needs text, a link, a photo, or a video.");
  }
  const params: Record<string, string> = { message, access_token: token };
  if (typeof settings.link === "string" && settings.link) params.link = settings.link;
  const json = await graphPost(`${pageId}/feed`, params, "post");
  const postId = String(json.id);
  return { kind: "done", externalId: postId, externalUrl: await permalink(postId, token) };
}

export const facebookAdapter: PlatformAdapter = {
  publish(ctx: PublishContext) {
    return publishStep(ctx.content, ctx.credential, ctx.settings, ctx.state as FacebookState | null);
  },
};

/**
 * Legacy single-call entry point, kept until publisher.ts registers
 * facebookAdapter. Runs every step inline (waits on video processing).
 */
export async function publishToFacebook(
  content: PostContent,
  credential: DecryptedCredential
): Promise<PublishResult> {
  let state: FacebookState | null = null;
  const giveUpAt = Date.now() + 270_000;
  for (;;) {
    const step = await publishStep(content, credential, {}, state);
    if (step.kind === "done") return { success: true, externalId: step.externalId, externalUrl: step.externalUrl };
    if (Date.now() > giveUpAt) throw new Error("Facebook is still processing the video. Check the Page before retrying.");
    state = step.state as FacebookState;
    await new Promise((r) => setTimeout(r, step.retryAfterMs ?? 20_000));
  }
}
