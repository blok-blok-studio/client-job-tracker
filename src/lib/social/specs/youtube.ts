/**
 * YouTube post rules (Shorts + regular videos).
 *
 * platformSettings keys:
 *   privacyStatus          "public" | "unlisted" | "private"   (default "public")
 *   categoryId             YouTube category id, e.g. "22"      (default "22" People & Blogs)
 *   tags                   string[]                            (≤500 characters combined)
 *   playlistId             playlist id to add the video to     (optional)
 *   madeForKids            boolean, REQUIRED explicit choice (YouTube's audience setting)
 *   notifySubscribers      boolean                             (default true)
 *   containsSyntheticMedia boolean, altered or synthetic content disclosure
 *
 * Legacy keys from the old post modal are still read: category (a label),
 * playlist, ytTags.
 */

import type { PlatformSpec, SpecInput, SpecIssue } from "./types";

/** Categories YouTube lets uploads be assigned to (id → label). */
export const YOUTUBE_CATEGORIES: { id: string; label: string }[] = [
  { id: "1", label: "Film & Animation" },
  { id: "2", label: "Autos & Vehicles" },
  { id: "10", label: "Music" },
  { id: "15", label: "Pets & Animals" },
  { id: "17", label: "Sports" },
  { id: "19", label: "Travel & Events" },
  { id: "20", label: "Gaming" },
  { id: "22", label: "People & Blogs" },
  { id: "23", label: "Comedy" },
  { id: "24", label: "Entertainment" },
  { id: "25", label: "News & Politics" },
  { id: "26", label: "Howto & Style" },
  { id: "27", label: "Education" },
  { id: "28", label: "Science & Technology" },
  { id: "29", label: "Nonprofits & Activism" },
];

export const YOUTUBE_LIMITS = {
  title: 100,
  /** bytes, not characters */
  descriptionBytes: 5000,
  tagsChars: 500,
  shortMaxSeconds: 180,
  thumbnailBytes: 2 * 1024 * 1024,
} as const;

export interface YouTubeSettings {
  privacyStatus: "public" | "unlisted" | "private";
  categoryId: string;
  tags: string[];
  playlistId: string | null;
  madeForKids: boolean | null;
  notifySubscribers: boolean;
  containsSyntheticMedia: boolean;
}

/** Read settings, falling back to the old modal's keys. */
export function readYouTubeSettings(settings: Record<string, unknown> | null | undefined): YouTubeSettings {
  const s = settings || {};
  const privacy = String(s.privacyStatus || "public").toLowerCase();

  let categoryId = typeof s.categoryId === "string" && s.categoryId ? s.categoryId : "";
  if (!categoryId && typeof s.category === "string" && s.category) {
    categoryId = YOUTUBE_CATEGORIES.find((c) => c.label === s.category || c.id === s.category)?.id || "";
  }

  const rawTags = Array.isArray(s.tags) ? s.tags : Array.isArray(s.ytTags) ? s.ytTags : [];
  const tags = rawTags.map((t) => String(t).trim().replace(/^#/, "")).filter(Boolean);

  const playlist = typeof s.playlistId === "string" && s.playlistId ? s.playlistId : typeof s.playlist === "string" ? s.playlist : "";

  return {
    privacyStatus: privacy === "unlisted" || privacy === "private" ? privacy : "public",
    categoryId: categoryId || "22",
    tags,
    playlistId: playlist.trim() || null,
    madeForKids: typeof s.madeForKids === "boolean" ? s.madeForKids : null,
    notifySubscribers: s.notifySubscribers !== false,
    containsSyntheticMedia: s.containsSyntheticMedia === true,
  };
}

/** Playlist ids look like PL…/UU…/FL… etc; the old modal stored free text names. */
export function looksLikePlaylistId(value: string): boolean {
  return /^[A-Za-z0-9_-]{13,}$/.test(value) && /^(PL|UU|FL|OL|LL|RD)/.test(value);
}

/** Combined tag length the way YouTube counts it (tags with spaces get quotes). */
export function tagsLength(tags: string[]): number {
  return tags.reduce((sum, t) => sum + t.length + (t.includes(" ") ? 2 : 0), 0) + Math.max(0, tags.length - 1);
}

export function buildYouTubeDescription(body: string | null | undefined, hashtags: string[] | undefined): string {
  const tagLine = (hashtags || []).map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  return [body || "", tagLine].filter(Boolean).join("\n\n");
}

function isShortShape(input: SpecInput): boolean {
  const video = input.media.find((m) => m.kind === "video");
  if (!video) return false;
  const { width, height, duration } = video;
  const verticalOrSquare = !width || !height ? true : height >= width;
  const shortEnough = duration == null ? true : duration <= YOUTUBE_LIMITS.shortMaxSeconds;
  return verticalOrSquare && shortEnough;
}

export const youtubeSpec: PlatformSpec = {
  platform: "YOUTUBE",
  label: "YouTube",
  postTypes: [
    { key: "short", label: "Short", media: "video", minMedia: 1, maxMedia: 1 },
    { key: "video", label: "Video", media: "video", minMedia: 1, maxMedia: 1 },
  ],
  limits: { title: YOUTUBE_LIMITS.title, body: YOUTUBE_LIMITS.descriptionBytes },

  defaultPostType(input) {
    return isShortShape(input) ? "short" : "video";
  },

  validate(input) {
    const issues: SpecIssue[] = [];
    const settings = readYouTubeSettings(input.settings);
    const postType = input.postType || youtubeSpec.defaultPostType(input);
    const videos = input.media.filter((m) => m.kind === "video");
    const images = input.media.filter((m) => m.kind === "image");

    // Media
    if (videos.length === 0) {
      issues.push({ level: "error", field: "media", message: "Add a video. YouTube posts need exactly one." });
    } else if (videos.length > 1) {
      issues.push({ level: "error", field: "media", message: "YouTube takes one video per post. Remove the extras or make separate posts." });
    }
    if (images.length > 0) {
      issues.push({
        level: "error",
        field: "media",
        message: "Images can't be posted as YouTube videos. Set a custom thumbnail in the YouTube settings instead.",
      });
    }

    const video = videos[0];
    if (video && postType === "short") {
      if (video.width && video.height && video.width > video.height) {
        issues.push({ level: "error", field: "media", message: "Shorts need a vertical or square video. Switch this post to a regular video." });
      }
      if (video.duration != null && video.duration > YOUTUBE_LIMITS.shortMaxSeconds) {
        issues.push({ level: "error", field: "media", message: "Shorts can be up to 3 minutes. Switch this post to a regular video." });
      }
    }

    // Title
    const title = (input.title || "").trim();
    if (!title) {
      issues.push({ level: "error", field: "title", message: "Add a title. YouTube requires one." });
    } else {
      if (title.length > YOUTUBE_LIMITS.title) {
        issues.push({ level: "error", field: "title", message: `Title is ${title.length} characters; YouTube allows ${YOUTUBE_LIMITS.title}.` });
      }
      if (/[<>]/.test(title)) {
        issues.push({ level: "error", field: "title", message: "YouTube titles can't contain < or >." });
      }
    }

    // Description
    const description = buildYouTubeDescription(input.body, input.hashtags);
    // TextEncoder, not Buffer: this also runs in the browser composer
    const descBytes = new TextEncoder().encode(description).length;
    if (descBytes > YOUTUBE_LIMITS.descriptionBytes) {
      issues.push({
        level: "error",
        field: "body",
        message: `Description with hashtags is ${descBytes} bytes; YouTube allows ${YOUTUBE_LIMITS.descriptionBytes}. Emoji and accented letters count as more than one.`,
      });
    }
    if (/[<>]/.test(description)) {
      issues.push({ level: "error", field: "body", message: "YouTube descriptions can't contain < or >." });
    }
    if ((input.hashtags || []).length > 60) {
      issues.push({ level: "warning", field: "hashtags", message: "YouTube ignores every hashtag on a video that has more than 60." });
    }

    // Tags
    if (tagsLength(settings.tags) > YOUTUBE_LIMITS.tagsChars) {
      issues.push({ level: "error", field: "settings.tags", message: `Tags add up to more than ${YOUTUBE_LIMITS.tagsChars} characters. Remove a few.` });
    }

    // Audience
    if (settings.madeForKids === null) {
      issues.push({ level: "error", field: "settings.madeForKids", message: "Choose whether this video is made for kids. YouTube requires it." });
    }

    // Playlist from the old free-text field
    if (settings.playlistId && !looksLikePlaylistId(settings.playlistId)) {
      issues.push({
        level: "warning",
        field: "settings.playlistId",
        message: "That doesn't look like a playlist id (they start with PL). The video will upload but won't be added to a playlist.",
      });
    }

    // Thumbnail
    const thumb = input.thumbnailUrl || input.coverImageUrl;
    if (thumb) {
      if (postType === "short") {
        issues.push({
          level: "warning",
          field: "thumbnailUrl",
          message: "Custom thumbnails usually don't show in the Shorts feed. YouTube picks a frame there.",
        });
      }
      if (!/\.(jpe?g|png)(\?|#|$)/i.test(thumb)) {
        issues.push({ level: "error", field: "thumbnailUrl", message: "YouTube thumbnails must be JPG or PNG." });
      }
    }

    // Scheduling
    if (input.publishMode !== "ASSISTED" && settings.privacyStatus !== "public" && input.scheduledAt) {
      issues.push({
        level: "warning",
        field: "settings.privacyStatus",
        message: `This will upload as ${settings.privacyStatus} at the scheduled time. Only public videos can be uploaded ahead and go live exactly on time.`,
      });
    }

    return issues;
  },
};
