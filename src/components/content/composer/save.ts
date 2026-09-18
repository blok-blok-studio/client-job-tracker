/**
 * Turns composer state into post rows: one per selected account, sharing a
 * groupId. New accounts are POSTed, existing rows PATCHed, removed rows
 * DELETEd. Rows the publisher owns (publishing/published) are never touched.
 */

import { readJson } from "@/lib/fetch-json";
import { effectiveFormat } from "./format-utils";
import { buildSpecInput, effectiveContent } from "./validation";
import { isLocked, platformName, type AccountDraft, type MediaMeta, type SharedContent } from "./types";

export type SaveIntent = "draft" | "schedule";

export interface SavedPost {
  id: string;
  platform: string;
  status: string;
  [key: string]: unknown;
}

export interface SaveResult {
  posts: SavedPost[];
  /** draft key → new post id, for drafts that were created */
  createdIds: Record<string, string>;
  errors: { key: string; label: string; message: string }[];
}

/** Settings stored on the post; UI-only flags stay out. */
function settingsForSave(draft: AccountDraft, shared: SharedContent, meta: Record<string, MediaMeta>): Record<string, unknown> {
  const input = buildSpecInput(draft, shared, meta, "");
  const postType = input.postType ?? null;
  const { mediaFormatManual, ...rest } = draft.settings;
  const content = effectiveContent(draft, shared);
  const altTexts: Record<string, string> = {};
  for (const url of content.mediaUrls) if (shared.altTexts[url]) altTexts[url] = shared.altTexts[url];

  const settings: Record<string, unknown> = {
    ...rest,
    postType,
    // Remember whether the type was chosen or inferred, so editing keeps inferring
    postTypeAuto: draft.postType === null,
    mediaFormat: effectiveFormat(draft, postType, input.media),
    mediaFormatManual: !!mediaFormatManual,
  };
  if (Object.keys(altTexts).length) settings.altTexts = altTexts;
  // Total upload size lets YouTube start its early upload only as far ahead as needed
  const mediaBytes = content.mediaUrls.reduce((sum, url) => sum + (meta[url]?.size || 0), 0);
  if (mediaBytes > 0) settings.mediaBytes = mediaBytes;
  for (const k of Object.keys(settings)) if (settings[k] === undefined) delete settings[k];
  return settings;
}

export function buildPayload(opts: {
  draft: AccountDraft;
  shared: SharedContent;
  meta: Record<string, MediaMeta>;
  clientId: string;
  groupId: string;
  scheduledAtIso: string;
  status: "DRAFT" | "SCHEDULED" | null;
  /** Mark the post as waiting on client approval in the same write, so it can't publish before the link exists */
  holdForApproval?: boolean;
}) {
  const { draft, shared, meta, clientId, groupId, scheduledAtIso, status, holdForApproval } = opts;
  const content = effectiveContent(draft, shared);
  const firstImage = content.mediaUrls.find((u) => meta[u]?.kind === "image");
  return {
    clientId,
    credentialId: draft.credentialId,
    platform: draft.platform,
    ...(status ? { status } : {}),
    title: content.title || "",
    body: content.body || "",
    hashtags: content.hashtags,
    mediaUrls: content.mediaUrls,
    scheduledAt: scheduledAtIso || null,
    taggedUsers: draft.taggedUsers,
    collaborators: draft.collaborators,
    altText: (firstImage && shared.altTexts[firstImage]) || null,
    coverImageUrl: draft.coverImageUrl || null,
    thumbnailUrl: draft.thumbnailUrl || null,
    firstComment: draft.firstComment || null,
    platformSettings: settingsForSave(draft, shared, meta),
    groupId,
    publishMode: draft.publishMode,
    // A TikTok draft also needs a person: someone finishes it in the app
    assignedToId: draft.publishMode === "ASSISTED" || draft.settings.tiktokDraft === true ? draft.assignedToId : null,
    ...(holdForApproval ? { holdForApproval: true } : {}),
  };
}

export async function savePosts(opts: {
  drafts: AccountDraft[];
  removedPostIds: string[];
  shared: SharedContent;
  meta: Record<string, MediaMeta>;
  clientId: string;
  groupId: string;
  scheduledAtIso: string;
  intent: SaveIntent;
  holdForApproval?: boolean;
  labelFor: (draft: AccountDraft) => string;
}): Promise<SaveResult> {
  const { drafts, removedPostIds, shared, meta, clientId, groupId, scheduledAtIso, intent, holdForApproval, labelFor } = opts;
  const result: SaveResult = { posts: [], createdIds: {}, errors: [] };

  for (const draft of drafts) {
    if (isLocked(draft)) continue;
    // A post waiting on a person keeps its status; only its content changes
    const status = draft.status === "ACTION_NEEDED" ? null : intent === "schedule" ? "SCHEDULED" : "DRAFT";
    const payload = buildPayload({ draft, shared, meta, clientId, groupId, scheduledAtIso, status, holdForApproval });
    const label = labelFor(draft);

    try {
      const res = draft.postId
        ? await fetch(`/api/content-posts/${draft.postId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/content-posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const json = await readJson<{ data: SavedPost }>(res, `Couldn't save the ${platformName(draft.platform)} post.`);
      if (!json.ok || !json.data?.data) {
        result.errors.push({ key: draft.key, label, message: json.error || "Save failed" });
        continue;
      }
      if (!draft.postId) result.createdIds[draft.key] = json.data.data.id;
      result.posts.push(json.data.data);
    } catch (err) {
      result.errors.push({ key: draft.key, label, message: err instanceof Error ? err.message : "Save failed" });
    }
  }

  for (const id of removedPostIds) {
    try {
      const res = await fetch(`/api/content-posts/${id}`, { method: "DELETE" });
      const json = await readJson(res, "Couldn't remove a post.");
      if (!json.ok) result.errors.push({ key: id, label: "Removed account", message: json.error || "Delete failed" });
    } catch {
      result.errors.push({ key: id, label: "Removed account", message: "Delete failed" });
    }
  }

  return result;
}

/** Ask the renderer to prepare formatted copies ahead of publish time. Never blocks saving. */
export function prewarmRenditions(clientId: string, drafts: AccountDraft[], shared: SharedContent, meta: Record<string, MediaMeta>) {
  const byFormat = new Map<string, { aspect: string; fit: string; focus?: unknown; urls: Set<string> }>();
  for (const draft of drafts) {
    if (isLocked(draft)) continue;
    const content = effectiveContent(draft, shared);
    const urls = content.mediaUrls.filter((u) => meta[u]?.kind === "image" || meta[u]?.kind === "video");
    if (!urls.length) continue;
    const input = buildSpecInput(draft, shared, meta, "");
    const format = effectiveFormat(draft, input.postType ?? null, input.media) as { aspect: string; fit: string; focus?: unknown };
    if (!format || format.aspect === "original") continue;
    const key = `${format.aspect}|${format.fit}|${JSON.stringify(format.focus || {})}`;
    const entry = byFormat.get(key) || { aspect: format.aspect, fit: format.fit, focus: format.focus, urls: new Set<string>() };
    urls.forEach((u) => entry.urls.add(u));
    byFormat.set(key, entry);
  }
  for (const entry of byFormat.values()) {
    fetch("/api/media-renditions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, urls: [...entry.urls], aspect: entry.aspect, fit: entry.fit, focus: entry.focus }),
      keepalive: true,
    }).catch(() => {});
  }
}
