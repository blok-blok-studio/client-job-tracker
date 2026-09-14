/**
 * Instagram publishing (feed, carousel, Reel, trial Reel, story) and post stats.
 *
 * Works for both connection types: Facebook Login credentials call
 * graph.facebook.com, Instagram Login credentials call graph.instagram.com
 * (credential.meta.apiHost). Same container endpoints on both.
 *
 * Steps, resumed across cron runs by the publish runner:
 *   create   → media containers (carousel children first, then the parent);
 *              every created id is handed back to be saved before the next call
 *   process  → poll status_code until FINISHED
 *   publish  → media_publish, then hand back immediately so the media id is
 *              saved before anything else happens (no double posts)
 *   comment  → first comment, saved before finishing (no double comments)
 *   finish   → fetch the permalink, done
 */

import prisma from "@/lib/prisma";
import { isVideoUrl } from "../media";
import { fetchWithRetry } from "../http";
import { ensureInstagramJpeg } from "../instagram-media";
import { instagramSpec } from "../specs/instagram";
import type { SpecMedia } from "../specs/types";
import {
  PublishValidationError,
  type NormalizedMetrics,
  type PlatformAdapter,
  type PublishContext,
  type PublishStep,
  type ResolvedCredential,
} from "../types";

const GRAPH_VERSION = "v25.0";

type IgPostType = "feed" | "carousel" | "reel" | "trial_reel" | "story";

interface IgState {
  step: "children" | "container" | "comment" | "finish";
  postType: IgPostType;
  childIds?: string[];
  containerId?: string;
  mediaId?: string;
  commentDone?: boolean;
  permalink?: string;
}

class GraphError extends Error {
  constructor(message: string, public code?: number, public subcode?: number) {
    super(message);
  }
}

function apiBase(credential: ResolvedCredential): string {
  const host = credential.meta?.apiHost || "graph.facebook.com";
  return `https://${host}/${GRAPH_VERSION}`;
}

async function graph<T = Record<string, unknown>>(
  credential: ResolvedCredential,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string | undefined> = {}
): Promise<T> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) query.set(k, v);
  query.set("access_token", credential.password);

  const url = `${apiBase(credential)}/${path}`;
  // Reads retry on transient errors; POSTs (containers, publish, comments) are
  // sent exactly once so a lost response can't create a duplicate
  const res =
    method === "GET"
      ? await fetchWithRetry(`${url}?${query}`)
      : await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: query.toString(),
        });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.error) {
    const err = (body.error || {}) as { message?: string; error_user_msg?: string; code?: number; error_subcode?: number };
    const message = err.error_user_msg || err.message || `HTTP ${res.status}`;
    throw new GraphError(`Instagram API error (${err.code ?? res.status}): ${message}`, err.code, err.error_subcode);
  }
  return body as T;
}

function captionOf(ctx: PublishContext): string {
  const tags = ctx.content.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  return [ctx.content.body, tags].filter(Boolean).join("\n\n");
}

function handles(list: string[] | null | undefined): string[] {
  return (list || []).map((h) => h.trim().replace(/^@/, "")).filter(Boolean);
}

/**
 * location_id must be a Facebook place (Page) ID. Anything else, like a typed
 * city name, makes Instagram reject the whole post, so it's left off instead.
 */
function locationIdOf(ctx: PublishContext): string | undefined {
  const raw = ctx.settings.locationId != null ? String(ctx.settings.locationId).trim() : "";
  return /^\d+$/.test(raw) ? raw : undefined;
}

function specMediaFor(urls: string[]): SpecMedia[] {
  return urls.map((url) => ({ url, kind: isVideoUrl(url) ? "video" : "image" }));
}

function resolvePostType(ctx: PublishContext): IgPostType {
  const media = specMediaFor(ctx.content.mediaUrls);
  let type = String(ctx.settings.postType || instagramSpec.defaultPostType({ media })) as IgPostType;
  // Legacy editor toggle
  if (!ctx.settings.postType && ctx.settings.shareToStory === true && media.length === 1) type = "story";
  // The API publishes a single feed video as a Reel
  if (type === "feed" && media[0]?.kind === "video") type = "reel";
  return type;
}

function validateOrThrow(ctx: PublishContext, postType: IgPostType) {
  const errors = instagramSpec
    .validate({
      postType,
      title: ctx.content.title,
      body: ctx.content.body,
      hashtags: ctx.content.hashtags,
      media: specMediaFor(ctx.content.mediaUrls),
      settings: ctx.settings,
      firstComment: ctx.post.firstComment,
      collaborators: ctx.post.collaborators,
      taggedUsers: ctx.post.taggedUsers,
      altText: ctx.post.altText,
      coverImageUrl: ctx.post.coverImageUrl,
    })
    .filter((i) => i.level === "error");
  if (errors.length) throw new PublishValidationError(errors.map((e) => e.message).join(" "));
}

async function checkPublishingLimit(credential: ResolvedCredential) {
  try {
    const res = await graph<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>(
      credential,
      "GET",
      `${credential.username}/content_publishing_limit`,
      { fields: "config,quota_usage" }
    );
    const row = res.data?.[0];
    const total = row?.config?.quota_total ?? 100;
    if (row?.quota_usage != null && row.quota_usage >= total) {
      throw new PublishValidationError(
        `This Instagram account has hit its limit of ${total} API posts in 24 hours. Reschedule for later.`
      );
    }
  } catch (err) {
    // The limit check is advisory; only a confirmed limit stops the post
    if (err instanceof PublishValidationError) throw err;
  }
}

async function createContainer(ctx: PublishContext, params: Record<string, string | undefined>): Promise<string> {
  const res = await graph<{ id: string }>(ctx.credential, "POST", `${ctx.credential.username}/media`, params);
  if (!res.id) throw new Error("Instagram didn't return a container id");
  return res.id;
}

async function logWarning(ctx: PublishContext, details: string) {
  await prisma.activityLog
    .create({ data: { clientId: ctx.post.clientId, actor: "publisher", action: "content_publish_warning", details } })
    .catch(() => {});
}

/**
 * Reel and story tags are newer on the API. If Instagram refuses the container
 * with tags, make it again without them so the post still goes out. Safe to
 * repeat: a refused request created nothing, and containers aren't posts.
 */
async function createContainerKeepingPost(
  ctx: PublishContext,
  params: Record<string, string | undefined>,
  postType: IgPostType
): Promise<string> {
  try {
    return await createContainer(ctx, params);
  } catch (err) {
    const tagsOptional = postType === "reel" || postType === "trial_reel" || postType === "story";
    if (!(err instanceof GraphError) || !params.user_tags || !tagsOptional) throw err;
    const id = await createContainer(ctx, { ...params, user_tags: undefined });
    await logWarning(ctx, `Instagram wouldn't take the tagged people on this ${postType === "story" ? "story" : "reel"}, so it was posted without them: ${err.message.slice(0, 200)}`);
    return id;
  }
}

/**
 * Paid partnership and AI labels. Never sent on stories or carousel items.
 * Brand partners are looked up by username; a label that can't be applied
 * stops the post instead of publishing sponsored content without it.
 */
async function labelParams(ctx: PublishContext): Promise<Record<string, string | undefined>> {
  const out: Record<string, string | undefined> = {};
  if (ctx.settings.aiGenerated === true) out.is_ai_generated = "true";

  const partners = handles(Array.isArray(ctx.settings.brandPartners) ? (ctx.settings.brandPartners as string[]) : [])
    .map((h) => h.toLowerCase())
    .filter((h) => /^[a-z0-9._]{1,30}$/.test(h))
    .slice(0, 2);
  if (ctx.settings.paidPartnership !== true && partners.length === 0) return out;

  if ((ctx.credential.meta?.apiHost || "graph.facebook.com") !== "graph.facebook.com") {
    throw new PublishValidationError(
      "Paid partnership labels only work when Instagram is connected through Facebook. Reconnect the account through Facebook, or turn the label off."
    );
  }
  out.is_paid_partnership = "true";
  if (partners.length) {
    const ids: string[] = [];
    for (const username of partners) {
      let id: string | undefined;
      try {
        const res = await graph<{ business_discovery?: { id?: string } }>(ctx.credential, "GET", ctx.credential.username, {
          fields: `business_discovery.username(${username}){id}`,
        });
        id = res.business_discovery?.id;
      } catch {
        id = undefined;
      }
      if (!id) {
        throw new PublishValidationError(`Couldn't find the brand @${username} on Instagram. Brand partners must be business or creator accounts.`);
      }
      ids.push(id);
    }
    out.branded_content_sponsor_ids = JSON.stringify(ids);
  }
  return out;
}

async function containerStatus(ctx: PublishContext, id: string): Promise<{ code: string; message?: string }> {
  const res = await graph<{ status_code?: string; status?: string }>(ctx.credential, "GET", id, {
    fields: "status_code,status",
  });
  return { code: res.status_code || "IN_PROGRESS", message: res.status };
}

function failForStatus(status: { code: string; message?: string }, what: string): never {
  if (status.code === "EXPIRED") {
    throw new Error(`Instagram ${what} expired before it could be published. Retry the post.`);
  }
  throw new Error(`Instagram couldn't process the ${what}${status.message ? `: ${status.message}` : "."}`);
}

/** Wait briefly in-process for fast containers (images) instead of a whole cron cycle. */
async function pollBriefly(ctx: PublishContext, ids: string[], maxWaitMs: number): Promise<Map<string, { code: string; message?: string }>> {
  const until = Math.min(Date.now() + maxWaitMs, ctx.deadline - 5_000);
  for (;;) {
    const statuses = new Map<string, { code: string; message?: string }>();
    for (const id of ids) statuses.set(id, await containerStatus(ctx, id));
    const pending = [...statuses.values()].some((s) => s.code === "IN_PROGRESS");
    if (!pending || Date.now() + 3_000 > until) return statuses;
    await new Promise((r) => setTimeout(r, 3_000));
  }
}

function userTagsJson(usernames: string[], withPosition: boolean): string | undefined {
  if (usernames.length === 0) return undefined;
  return JSON.stringify(usernames.map((username) => (withPosition ? { username, x: 0.5, y: 0.5 } : { username })));
}

async function imageUrlFor(ctx: PublishContext, url: string, index: number): Promise<string> {
  return ensureInstagramJpeg(url, ctx.post.id, index);
}

/**
 * Alt text for the image at `index` of content.mediaUrls. The composer keys
 * platformSettings.altTexts by the ORIGINAL media URL; content.mediaUrls may
 * hold formatted renditions in the same order, so map by position onto
 * post.mediaUrls (PDFs excluded, as buildPostContent does).
 */
function altTextFor(ctx: PublishContext, index: number): string | undefined {
  const originals = ctx.post.mediaUrls.filter((u) => !/\.pdf$/i.test(u));
  const altTexts = ctx.settings.altTexts as Record<string, unknown> | undefined;
  const perImage = altTexts && originals[index] ? altTexts[originals[index]] : undefined;
  if (typeof perImage === "string" && perImage.trim()) return perImage.trim();
  // Legacy single alt text describes the first image
  return index === 0 && ctx.post.altText ? ctx.post.altText : undefined;
}

/** First call: create the container(s). */
async function start(ctx: PublishContext): Promise<PublishStep> {
  const postType = resolvePostType(ctx);
  validateOrThrow(ctx, postType);
  await checkPublishingLimit(ctx.credential);

  const caption = captionOf(ctx);
  const collaborators = handles(ctx.post.collaborators);
  const tagged = handles(ctx.post.taggedUsers);
  const locationId = locationIdOf(ctx);
  const urls = ctx.content.mediaUrls;

  // Resolve labels first so a bad brand partner stops the post before anything is uploaded
  const labels = postType === "story" ? {} : await labelParams(ctx);

  if (postType === "carousel") {
    const childIds: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      if (isVideoUrl(url)) {
        childIds.push(await createContainer(ctx, { media_type: "VIDEO", video_url: url, is_carousel_item: "true" }));
      } else {
        childIds.push(
          await createContainer(ctx, {
            image_url: await imageUrlFor(ctx, url, i),
            is_carousel_item: "true",
            alt_text: altTextFor(ctx, i),
            user_tags: i === 0 ? userTagsJson(tagged, true) : undefined,
          })
        );
      }
    }
    // Save the child ids before anything else happens
    return { kind: "continue", phase: "processing", state: { step: "children", postType, childIds }, retryAfterMs: 0 };
  }

  const url = urls[0];
  const params: Record<string, string | undefined> = {};

  if (postType === "story") {
    params.media_type = "STORIES";
    if (isVideoUrl(url)) params.video_url = url;
    else params.image_url = await imageUrlFor(ctx, url, 0);
    params.user_tags = userTagsJson(tagged, false);
  } else if (postType === "reel" || postType === "trial_reel") {
    params.media_type = "REELS";
    params.video_url = url;
    params.caption = caption;
    params.share_to_feed = String(ctx.settings.shareToFeed ?? true);
    params.cover_url = ctx.post.coverImageUrl || undefined;
    params.thumb_offset = ctx.settings.thumbOffsetMs != null ? String(ctx.settings.thumbOffsetMs) : undefined;
    params.audio_name = ctx.settings.audioName ? String(ctx.settings.audioName) : undefined;
    params.location_id = locationId;
    params.collaborators = collaborators.length ? JSON.stringify(collaborators) : undefined;
    params.user_tags = userTagsJson(tagged, false);
    if (postType === "trial_reel") {
      params.trial_params = JSON.stringify({ graduation_strategy: String(ctx.settings.trialGraduation || "MANUAL") });
    }
  } else {
    params.image_url = await imageUrlFor(ctx, url, 0);
    params.caption = caption;
    params.alt_text = altTextFor(ctx, 0);
    params.location_id = locationId;
    params.collaborators = collaborators.length ? JSON.stringify(collaborators) : undefined;
    params.user_tags = userTagsJson(tagged, true);
  }

  const containerId = await createContainerKeepingPost(ctx, { ...params, ...labels }, postType);
  // Save the container id before polling or publishing
  return { kind: "continue", phase: "processing", state: { step: "container", postType, containerId }, retryAfterMs: 0 };
}

/** Move a post forward from wherever its state says it is. */
async function advance(ctx: PublishContext, state: IgState): Promise<PublishStep> {
  const isVideoish = ctx.content.mediaUrls.some(isVideoUrl);
  const retryAfterMs = isVideoish ? 15_000 : 5_000;

  // Carousel children must finish processing before the parent can be made.
  // A parent already recorded means this step ran before: never make a second one.
  if (state.step === "children" && state.containerId) state = { ...state, step: "container" };
  if (state.step === "children") {
    const statuses = await pollBriefly(ctx, state.childIds || [], isVideoish ? 5_000 : 20_000);
    for (const s of statuses.values()) if (s.code === "ERROR" || s.code === "EXPIRED") failForStatus(s, "carousel item");
    if ([...statuses.values()].some((s) => s.code === "IN_PROGRESS")) {
      return { kind: "continue", phase: "processing", state: { ...state }, retryAfterMs };
    }

    const collaborators = handles(ctx.post.collaborators);
    const containerId = await createContainer(ctx, {
      media_type: "CAROUSEL",
      children: (state.childIds || []).join(","),
      caption: captionOf(ctx),
      location_id: locationIdOf(ctx),
      collaborators: collaborators.length ? JSON.stringify(collaborators) : undefined,
      ...(await labelParams(ctx)),
    });
    // Save the parent id before polling or publishing it
    return { kind: "continue", phase: "processing", state: { ...state, step: "container", containerId }, retryAfterMs: 0 };
  }

  // A media id already recorded means media_publish ran: go straight to the comment
  if (state.step === "container" && state.mediaId) state = { ...state, step: "comment" };

  if (state.step === "container") {
    const containerId = state.containerId!;
    const status = (await pollBriefly(ctx, [containerId], isVideoish ? 5_000 : 20_000)).get(containerId)!;

    if (status.code === "IN_PROGRESS") {
      return { kind: "continue", phase: "processing", state: { ...state }, retryAfterMs };
    }
    if (status.code === "PUBLISHED") {
      // Published by an earlier run that never got to save the media id
      throw new Error(
        "Instagram shows this post as already published, but the tracker never got confirmation. Check the account before retrying so it doesn't post twice."
      );
    }
    if (status.code !== "FINISHED") failForStatus(status, "media");

    let mediaId: string;
    try {
      const res = await graph<{ id: string }>(ctx.credential, "POST", `${ctx.credential.username}/media_publish`, {
        creation_id: containerId,
      });
      mediaId = res.id;
    } catch (err) {
      const after = await containerStatus(ctx, containerId).catch(() => null);
      if (after?.code === "PUBLISHED") {
        throw new Error(
          "Instagram published this post but didn't confirm it. Check the account before retrying so it doesn't post twice."
        );
      }
      throw err;
    }

    // Save the media id before doing anything else
    return { kind: "continue", phase: "processing", state: { ...state, step: "comment", mediaId }, retryAfterMs: 0 };
  }

  if (state.step === "comment") {
    const firstComment = ctx.post.firstComment?.trim();
    if (firstComment && !state.commentDone && state.postType !== "story") {
      try {
        await graph(ctx.credential, "POST", `${state.mediaId}/comments`, { message: firstComment });
      } catch (err) {
        await prisma.activityLog
          .create({
            data: {
              clientId: ctx.post.clientId,
              actor: "publisher",
              action: "content_publish_warning",
              details: `Instagram post published, but the first comment failed: ${(err as Error).message.slice(0, 300)}`,
            },
          })
          .catch(() => {});
      }
      return { kind: "continue", phase: "processing", state: { ...state, step: "finish", commentDone: true }, retryAfterMs: 0 };
    }
    state = { ...state, step: "finish" };
  }

  // finish
  let permalink: string | undefined;
  try {
    const res = await graph<{ permalink?: string }>(ctx.credential, "GET", state.mediaId!, { fields: "permalink" });
    permalink = res.permalink;
  } catch {
    // Stories and some accounts don't expose a permalink; the post is still live
  }
  return { kind: "done", externalId: state.mediaId, externalUrl: permalink };
}

async function publish(ctx: PublishContext): Promise<PublishStep> {
  const state = ctx.state as IgState | null;
  if (!state || !state.step) return start(ctx);
  return advance(ctx, state);
}

// ─── Stats ──────────────────────────────────────────────────────────────────

const FEED_METRICS = ["views", "reach", "likes", "comments", "shares", "saved", "total_interactions"];
const STORY_METRICS = ["views", "reach", "total_interactions"];

function metricValue(row: { values?: { value?: unknown }[]; total_value?: { value?: unknown } }): number | null {
  const v = row.total_value?.value ?? row.values?.[0]?.value;
  return typeof v === "number" ? v : null;
}

async function metricsForMedia(
  credential: ResolvedCredential,
  mediaId: string,
  postType: string | undefined
): Promise<NormalizedMetrics | null> {
  const raw: Record<string, unknown> = {};
  const values: Record<string, number | null> = {};

  const sets = postType === "story" ? [STORY_METRICS, ["reach"]] : [FEED_METRICS, ["views", "reach"]];
  for (const metrics of sets) {
    try {
      const res = await graph<{ data?: { name: string; values?: { value?: unknown }[]; total_value?: { value?: unknown } }[] }>(
        credential,
        "GET",
        `${mediaId}/insights`,
        { metric: metrics.join(",") }
      );
      for (const row of res.data || []) values[row.name] = metricValue(row);
      raw.insights = res.data;
      break;
    } catch (err) {
      raw.insightsError = (err as Error).message.slice(0, 200);
    }
  }

  // Likes and comments are plain fields even when insights aren't available
  if (values.likes == null || values.comments == null) {
    try {
      const fields = await graph<{ like_count?: number; comments_count?: number }>(credential, "GET", mediaId, {
        fields: "like_count,comments_count",
      });
      values.likes ??= fields.like_count ?? null;
      values.comments ??= fields.comments_count ?? null;
    } catch (err) {
      // Media deleted or token lacks access: no data this round
      if (Object.keys(values).length === 0) return null;
      raw.fieldsError = (err as Error).message.slice(0, 200);
    }
  }

  return {
    views: values.views ?? null,
    reach: values.reach ?? null,
    likes: values.likes ?? null,
    comments: values.comments ?? null,
    shares: values.shares ?? null,
    saves: values.saved ?? null,
    raw,
  };
}

async function fetchMetrics(
  credential: ResolvedCredential,
  posts: Parameters<NonNullable<PlatformAdapter["fetchMetrics"]>>[1]
): Promise<Record<string, NormalizedMetrics>> {
  const out: Record<string, NormalizedMetrics> = {};
  const queue = posts.filter((p) => p.externalId);

  // A few at a time keeps well inside Instagram's per-account rate limits
  const CONCURRENCY = 4;
  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    await Promise.all(
      queue.slice(i, i + CONCURRENCY).map(async (post) => {
        const settings = (post.platformSettings as Record<string, unknown> | null) || {};
        const m = await metricsForMedia(credential, post.externalId!, settings.postType as string | undefined).catch(() => null);
        if (m) out[post.externalId!] = m;
      })
    );
  }
  return out;
}

export const instagramAdapter: PlatformAdapter = { publish, fetchMetrics };
