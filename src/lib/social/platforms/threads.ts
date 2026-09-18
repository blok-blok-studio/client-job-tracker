/**
 * Threads publishing (graph.threads.net).
 *
 * Needs a credential from the Threads OAuth provider (Threads user id in
 * username, long-lived Threads token in password). A Facebook Login token can't
 * call the Threads API, so Threads is no longer discovered through the Meta flow.
 *
 * Flow, one runner step at a time: create container(s) → wait until FINISHED
 * (Meta recommends ~30s, videos take longer) → threads_publish → save the
 * media id → fetch the permalink. Carousels (2–20 items) create and wait on each
 * child first. Text is capped at 500 characters.
 */

import { getClientCredentials, getProviderConfig } from "@/lib/oauth/config";
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

const API = "https://graph.threads.net/v1.0";
const MAX_TEXT = 500;
const MAX_CAROUSEL = 20;

function postText(content: PostContent): string {
  const tags = content.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  return [content.body, tags].filter(Boolean).join("\n\n");
}

async function call(
  method: "GET" | "POST",
  path: string,
  params: Record<string, string>,
  action: string
): Promise<Record<string, unknown>> {
  const query = new URLSearchParams(params);
  // Reads retry on transient errors; creates and publishes go out exactly once
  const res =
    method === "GET"
      ? await fetchWithRetry(`${API}/${path}?${query}`)
      : await fetch(`${API}/${path}`, { method: "POST", body: query });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const message = json.error?.message || `HTTP ${res.status}`;
    const hint = json.error?.code === 190 ? " The Threads connection expired. Reconnect Threads on the client page." : "";
    throw new Error(`Threads ${action} failed: ${message}.${hint}`);
  }
  return json;
}

async function containerStatus(id: string, token: string): Promise<{ status: string; error?: string }> {
  const json = await call("GET", id, { fields: "status,error_message", access_token: token }, "status check");
  return { status: String(json.status || ""), error: json.error_message as string | undefined };
}

function mediaParams(url: string): Record<string, string> {
  return isVideoUrl(url) ? { media_type: "VIDEO", video_url: url } : { media_type: "IMAGE", image_url: url };
}

interface ThreadsState {
  childIds?: string[];
  containerId?: string;
  mediaId?: string;
}

async function publishStep(
  content: PostContent,
  credential: { username: string; password: string },
  altText: string | null,
  state: ThreadsState | null
): Promise<PublishStep> {
  const userId = credential.username;
  const token = credential.password;

  // ─── Published: fetch the link and finish ──────────────────────────────────
  if (state?.mediaId) {
    let externalUrl: string | undefined;
    try {
      const json = await call("GET", state.mediaId, { fields: "permalink", access_token: token }, "permalink lookup");
      externalUrl = json.permalink as string | undefined;
    } catch {
      // The post is live either way
    }
    return { kind: "done", externalId: state.mediaId, externalUrl };
  }

  // ─── Container created: wait for it, then publish ──────────────────────────
  if (state?.containerId) {
    const { status, error } = await containerStatus(state.containerId, token);
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`Threads couldn't process the post: ${error || status}`);
    }
    if (status === "PUBLISHED") {
      throw new Error("Threads shows this post as already published, but the tracker didn't record it. Check the account before retrying.");
    }
    if (status !== "FINISHED") {
      return { kind: "continue", phase: "processing", state: { ...state }, retryAfterMs: 30_000 };
    }
    const json = await call("POST", `${userId}/threads_publish`, { creation_id: state.containerId, access_token: token }, "publish");
    // Save the media id before anything else (double-post rule)
    return { kind: "continue", phase: "processing", state: { ...state, mediaId: String(json.id) }, retryAfterMs: 0 };
  }

  const text = postText(content);

  // ─── Carousel children created: wait for all, then build the carousel ──────
  if (state?.childIds) {
    for (const id of state.childIds) {
      const { status, error } = await containerStatus(id, token);
      if (status === "ERROR" || status === "EXPIRED") {
        throw new Error(`Threads couldn't process a carousel item: ${error || status}`);
      }
      if (status !== "FINISHED") {
        return { kind: "continue", phase: "processing", state: { ...state }, retryAfterMs: 30_000 };
      }
    }
    const params: Record<string, string> = {
      media_type: "CAROUSEL",
      children: state.childIds.join(","),
      access_token: token,
    };
    if (text) params.text = text;
    const json = await call("POST", `${userId}/threads`, params, "carousel creation");
    return { kind: "continue", phase: "processing", state: { ...state, containerId: String(json.id) }, retryAfterMs: 10_000 };
  }

  // ─── First step: validate and create containers ────────────────────────────
  if ([...text].length > MAX_TEXT) {
    throw new PublishValidationError(`Threads posts are limited to ${MAX_TEXT} characters. This one has ${[...text].length}.`);
  }
  const media = content.mediaUrls;
  if (media.length > MAX_CAROUSEL) {
    throw new PublishValidationError(`A Threads carousel can have up to ${MAX_CAROUSEL} items. This one has ${media.length}.`);
  }

  if (media.length === 0) {
    if (!text) throw new PublishValidationError("A Threads post needs text or media.");
    const json = await call("POST", `${userId}/threads`, { media_type: "TEXT", text, access_token: token }, "post creation");
    return { kind: "continue", phase: "processing", state: { containerId: String(json.id) }, retryAfterMs: 10_000 };
  }

  if (media.length === 1) {
    const params: Record<string, string> = { ...mediaParams(media[0]), access_token: token };
    if (text) params.text = text;
    if (altText && !isVideoUrl(media[0])) params.alt_text = altText;
    const json = await call("POST", `${userId}/threads`, params, "media creation");
    return {
      kind: "continue",
      phase: "processing",
      state: { containerId: String(json.id) },
      retryAfterMs: isVideoUrl(media[0]) ? 30_000 : 10_000,
    };
  }

  // Unpublished child containers expire on their own, so creating them is safe to redo
  const childIds: string[] = [];
  for (const url of media) {
    const json = await call(
      "POST",
      `${userId}/threads`,
      { ...mediaParams(url), is_carousel_item: "true", access_token: token },
      "carousel item creation"
    );
    childIds.push(String(json.id));
  }
  return { kind: "continue", phase: "processing", state: { childIds }, retryAfterMs: 15_000 };
}

export const threadsAdapter: PlatformAdapter = {
  publish(ctx: PublishContext) {
    return publishStep(ctx.content, ctx.credential, ctx.post?.altText ?? null, ctx.state as ThreadsState | null);
  },
};

/** Threads OAuth: swap the 1-hour token for a 60-day one. */
export async function exchangeThreadsLongLivedToken(
  shortToken: string
): Promise<{ access_token: string; expires_in?: number }> {
  const { clientSecret } = getClientCredentials(getProviderConfig("threads")!);
  const params = new URLSearchParams({
    grant_type: "th_exchange_token",
    client_secret: clientSecret,
    access_token: shortToken,
  });
  const res = await fetchWithRetry(`https://graph.threads.net/access_token?${params}`);
  if (!res.ok) throw new Error(`Threads long-lived token exchange failed: ${await res.text()}`);
  return res.json();
}

/** Extend a still-valid long-lived Threads token (must be at least 24h old) by 60 days. */
export async function refreshThreadsToken(
  longLivedToken: string
): Promise<{ access_token: string; expires_in?: number }> {
  const params = new URLSearchParams({ grant_type: "th_refresh_token", access_token: longLivedToken });
  const res = await fetchWithRetry(`https://graph.threads.net/refresh_access_token?${params}`);
  if (!res.ok) throw new Error(`Threads token refresh failed: ${await res.text()}`);
  return res.json();
}

/**
 * Legacy single-call entry point, kept until publisher.ts registers
 * threadsAdapter. Runs every step inline.
 */
export async function publishToThreads(content: PostContent, cred: DecryptedCredential): Promise<PublishResult> {
  let state: ThreadsState | null = null;
  const giveUpAt = Date.now() + 270_000;
  for (;;) {
    const step = await publishStep(content, cred, null, state);
    if (step.kind === "done") return { success: true, externalId: step.externalId, externalUrl: step.externalUrl };
    if (Date.now() > giveUpAt) throw new Error("Threads is still processing the post. Check the account before retrying.");
    if (step.kind !== "continue") throw new Error("Unexpected publish step");
    state = step.state as ThreadsState;
    await new Promise((r) => setTimeout(r, step.retryAfterMs ?? 10_000));
  }
}
