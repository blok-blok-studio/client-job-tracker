import { getSpec, validateForPlatform, type SpecInput, type SpecIssue, type SpecMedia } from "@/lib/social/specs";
import { effectiveFormat, formattedMeta } from "./format-utils";
import {
  FALLBACK_BODY_LIMITS,
  isLocked,
  type AccountDraft,
  type ComposerAccount,
  type MediaMeta,
  type SharedContent,
} from "./types";

export interface TikTokCreatorInfo {
  username?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number | null;
}

/** Caption/media actually used for this account after overrides. */
export function effectiveContent(draft: AccountDraft, shared: SharedContent) {
  const title = draft.overrideCaption ? draft.title : shared.title;
  const body = draft.overrideCaption ? draft.body : shared.body;
  const hashtags = draft.overrideCaption ? draft.hashtags : shared.hashtags;
  const mediaUrls = draft.overrideMedia
    ? shared.mediaUrls.filter((u) => draft.mediaUrls.includes(u))
    : shared.mediaUrls;
  return { title, body, hashtags, mediaUrls };
}

export function toSpecMedia(urls: string[], meta: Record<string, MediaMeta>): SpecMedia[] {
  return urls
    .map((url) => ({ url, m: meta[url] }))
    .filter(({ url, m }) => (m ? m.kind === "image" || m.kind === "video" : /\.(jpe?g|png|gif|webp|heic|heif|mp4|mov|m4v|webm)(\?|$)/i.test(url)))
    .map(({ url, m }) => ({
      url,
      kind: (m?.kind === "video" || (!m && /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url)) ? "video" : "image") as SpecMedia["kind"],
      width: m?.width ?? null,
      height: m?.height ?? null,
      duration: m?.duration ?? null,
      size: m?.size ?? null,
      mimeType: m?.mimeType ?? null,
    }));
}

export function buildSpecInput(
  draft: AccountDraft,
  shared: SharedContent,
  meta: Record<string, MediaMeta>,
  scheduledAtIso: string,
  extraSettings: Record<string, unknown> = {}
): SpecInput {
  const content = effectiveContent(draft, shared);
  const media = toSpecMedia(content.mediaUrls, meta);
  const firstImage = media.find((m) => m.kind === "image");
  const input: SpecInput = {
    postType: draft.postType,
    title: content.title,
    body: content.body,
    hashtags: content.hashtags,
    media,
    settings: { ...draft.settings, ...extraSettings },
    firstComment: draft.firstComment || null,
    collaborators: draft.collaborators,
    taggedUsers: draft.taggedUsers,
    altText: firstImage ? shared.altTexts[firstImage.url] || null : null,
    coverImageUrl: draft.coverImageUrl || null,
    thumbnailUrl: draft.thumbnailUrl || null,
    publishMode: draft.publishMode,
    scheduledAt: scheduledAtIso || null,
  };
  const spec = getSpec(draft.platform);
  if (!input.postType && spec) {
    try {
      input.postType = spec.defaultPostType(input) || null;
    } catch {
      input.postType = null;
    }
  }
  return input;
}

export function resolvedPostType(draft: AccountDraft, shared: SharedContent, meta: Record<string, MediaMeta>): string | null {
  return buildSpecInput(draft, shared, meta, "").postType ?? null;
}

export type ComposeIntent = "draft" | "schedule";

/** Everything wrong (or worth a second look) for one account. */
export function issuesForDraft(opts: {
  draft: AccountDraft;
  account?: ComposerAccount;
  shared: SharedContent;
  meta: Record<string, MediaMeta>;
  scheduledAtIso: string;
  tiktok?: TikTokCreatorInfo | null;
  tiktokError?: string | null;
}): SpecIssue[] {
  const { draft, account, shared, meta, scheduledAtIso, tiktok, tiktokError } = opts;
  if (isLocked(draft)) return [];

  const extra: Record<string, unknown> = {};
  if (tiktok?.maxVideoPostDurationSec) extra.maxVideoPostDurationSec = tiktok.maxVideoPostDurationSec;
  if (tiktok?.privacyLevelOptions) extra.privacyLevelOptions = tiktok.privacyLevelOptions;

  // Judge media by what will be posted: dimensions after the chosen format
  const rawInput = buildSpecInput(draft, shared, meta, scheduledAtIso, extra);
  const format = effectiveFormat(draft, rawInput.postType ?? null, rawInput.media);
  const input = buildSpecInput(
    { ...draft, postType: rawInput.postType ?? null },
    shared,
    formattedMeta(meta, effectiveContent(draft, shared).mediaUrls, format),
    scheduledAtIso,
    { ...extra, mediaFormat: format }
  );
  let issues: SpecIssue[] = [];
  try {
    issues = validateForPlatform(draft.platform, input);
  } catch {
    issues = [];
  }

  const add = (issue: SpecIssue) => issues.push(issue);
  const content = effectiveContent(draft, shared);

  if (!getSpec(draft.platform)) {
    const limit = FALLBACK_BODY_LIMITS[draft.platform];
    const captionLength = [content.body, content.hashtags.map((h) => `#${h}`).join(" ")].filter(Boolean).join("\n\n").length;
    if (limit && captionLength > limit) {
      add({ level: "error", field: "body", message: `Caption is ${captionLength} characters; the limit is ${limit}.` });
    }
    if (!content.body.trim() && content.mediaUrls.length === 0) {
      add({ level: "error", field: "body", message: "Add a caption or media." });
    }
  }

  if (draft.publishMode === "ASSISTED") {
    if (!draft.assignedToId) {
      add(
        draft.platform === "REDNOTE"
          ? { level: "error", field: "assignedToId", message: "Pick who will post this on RedNote." }
          : { level: "warning", field: "assignedToId", message: "Nobody is assigned, so the owners get the reminder." }
      );
    }
  } else if (account) {
    if (draft.settings.tiktokDraft === true && !draft.assignedToId) {
      add({ level: "warning", field: "assignedToId", message: "Nobody is assigned to finish the draft in TikTok, so the owners get the reminder." });
    }
    if (account.health === "expired" || account.health === "needs_reconnect") {
      add({ level: "warning", message: "This connection needs a reconnect before the post is due, or it will fail." });
    } else if (account.health === "expiring") {
      add({ level: "warning", message: "This connection expires within 7 days. Reconnect it to be safe." });
    }
  }

  if (draft.platform === "TIKTOK" && draft.publishMode === "AUTO" && draft.settings.tiktokDraft !== true) {
    const s = draft.settings;
    if (tiktokError) {
      add({ level: "warning", message: `Couldn't load TikTok account settings: ${tiktokError}` });
    }
    const privacy = s.privacyLevel as string | undefined;
    if (!privacy) {
      add({ level: "error", field: "settings.privacyLevel", message: "Choose who can see this TikTok post." });
    } else if (tiktok && !tiktok.privacyLevelOptions.includes(privacy)) {
      add({ level: "error", field: "settings.privacyLevel", message: "That privacy option isn't available on this TikTok account." });
    }
    if (s.discloseCommercial && !s.brandOrganic && !s.brandedContent) {
      add({ level: "error", field: "settings.discloseCommercial", message: "Pick Your brand, Branded content, or both, or turn disclosure off." });
    }
    if (s.brandedContent && privacy === "SELF_ONLY") {
      add({ level: "error", field: "settings.privacyLevel", message: "Branded content can't be posted as Only me." });
    }
    const video = toSpecMedia(content.mediaUrls, meta).find((m) => m.kind === "video");
    if (video?.duration && tiktok?.maxVideoPostDurationSec && video.duration > tiktok.maxVideoPostDurationSec) {
      add({
        level: "error",
        field: "media",
        message: `Video is ${Math.round(video.duration)}s; this account can post up to ${tiktok.maxVideoPostDurationSec}s.`,
      });
    }
  }

  // Specs and composer checks can say the same thing; show it once
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = `${i.level}:${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
