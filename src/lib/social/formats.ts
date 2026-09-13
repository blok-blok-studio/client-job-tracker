/**
 * Media formatting presets for posting: which aspect ratios each platform and
 * post type accepts, the frame size a formatted copy is rendered at, and how
 * a post stores its choice.
 *
 * Client-safe (no server imports): the composer uses this for its pickers and
 * live previews, src/lib/social/renditions.ts uses it to render.
 *
 * Post data contract, in post.platformSettings.mediaFormat:
 *   { aspect: "original" | "9:16" | ..., fit: "pad" | "crop", focus?: { [sourceUrl]: { x, y } } }
 * One format per post, so every item in a carousel shares one aspect
 * (Instagram requires that anyway).
 *   pad  = whole frame visible, black bars fill the gap
 *   crop = fills the frame with no bars; focus (0..1 from left/top) picks what stays
 */

export type FitMode = "pad" | "crop";

export interface FocusPoint {
  x: number;
  y: number;
}

export interface MediaFormat {
  aspect: string;
  fit: FitMode;
  focus?: Record<string, FocusPoint>;
}

export interface AspectPreset {
  key: string;
  label: string;
  /** Short hint shown under the chip */
  hint: string;
  width: number;
  height: number;
}

export const ORIGINAL_ASPECT = "original";

/** Frame sizes are shared by images and videos; all dimensions are even for H.264. */
export const ASPECT_PRESETS: Record<string, AspectPreset> = {
  "9:16": { key: "9:16", label: "9:16", hint: "Vertical", width: 1080, height: 1920 },
  "16:9": { key: "16:9", label: "16:9", hint: "Widescreen", width: 1920, height: 1080 },
  "1:1": { key: "1:1", label: "1:1", hint: "Square", width: 1080, height: 1080 },
  "4:5": { key: "4:5", label: "4:5", hint: "Portrait", width: 1080, height: 1350 },
  "3:4": { key: "3:4", label: "3:4", hint: "Portrait", width: 1080, height: 1440 },
  "4:3": { key: "4:3", label: "4:3", hint: "Landscape", width: 1440, height: 1080 },
  "2:3": { key: "2:3", label: "2:3", hint: "Tall", width: 1080, height: 1620 },
  "1.91:1": { key: "1.91:1", label: "1.91:1", hint: "Link / wide", width: 1080, height: 566 },
};

interface FormatRule {
  /** Allowed presets, most useful first; "original" is always offered after these */
  aspects: string[];
  defaultAspect: string;
  /** Platform-side limit worth telling the person about */
  note?: string;
}

interface PlatformFormats {
  byPostType?: Record<string, FormatRule>;
  fallback: FormatRule;
}

/**
 * Edit here when a platform changes what it accepts. Sources (Sept 2026):
 * Instagram's content publishing reference requires feed and carousel images
 * within 4:5 to 1.91:1; Reels and Stories accept any ratio but recommend 9:16.
 */
export const PLATFORM_FORMATS: Record<string, PlatformFormats> = {
  TIKTOK: {
    byPostType: {
      video: { aspects: ["9:16", "1:1", "16:9"], defaultAspect: "9:16" },
      photo: { aspects: ["9:16", "4:5", "1:1", "16:9"], defaultAspect: "9:16" },
    },
    fallback: { aspects: ["9:16", "1:1", "16:9"], defaultAspect: "9:16" },
  },
  INSTAGRAM: {
    byPostType: {
      feed: {
        aspects: ["4:5", "1:1", "1.91:1"],
        defaultAspect: "4:5",
        note: "Instagram only accepts feed images between 4:5 and 1.91:1.",
      },
      carousel: {
        aspects: ["4:5", "1:1", "1.91:1"],
        defaultAspect: "4:5",
        note: "Every slide uses the same shape. Instagram accepts 4:5 to 1.91:1.",
      },
      reel: { aspects: ["9:16", "4:5", "1:1"], defaultAspect: "9:16" },
      trial_reel: { aspects: ["9:16", "4:5", "1:1"], defaultAspect: "9:16" },
      story: { aspects: ["9:16"], defaultAspect: "9:16" },
    },
    fallback: { aspects: ["4:5", "1:1", "1.91:1", "9:16"], defaultAspect: "4:5" },
  },
  YOUTUBE: {
    byPostType: {
      short: { aspects: ["9:16", "1:1"], defaultAspect: "9:16", note: "Shorts must be vertical or square." },
      video: { aspects: ["16:9", "4:3", "1:1"], defaultAspect: "16:9" },
    },
    fallback: { aspects: ["16:9", "9:16", "1:1"], defaultAspect: "16:9" },
  },
  REDNOTE: {
    byPostType: {
      image_note: { aspects: ["3:4", "1:1", "9:16", "4:3"], defaultAspect: "3:4" },
      video_note: { aspects: ["9:16", "3:4", "1:1", "16:9"], defaultAspect: "9:16" },
    },
    fallback: { aspects: ["3:4", "1:1", "9:16"], defaultAspect: "3:4" },
  },
  FACEBOOK: {
    byPostType: {
      reel: { aspects: ["9:16"], defaultAspect: "9:16" },
      story: { aspects: ["9:16"], defaultAspect: "9:16" },
    },
    fallback: { aspects: ["4:5", "1:1", "16:9", "9:16"], defaultAspect: "4:5" },
  },
  LINKEDIN: {
    fallback: { aspects: ["1:1", "16:9", "4:5", "9:16"], defaultAspect: "1:1" },
  },
  TWITTER: {
    fallback: { aspects: ["16:9", "1:1", "4:5", "9:16"], defaultAspect: "16:9" },
  },
  THREADS: {
    fallback: { aspects: ["4:5", "1:1", "9:16", "16:9"], defaultAspect: "4:5" },
  },
};

const GENERIC_RULE: FormatRule = { aspects: ["9:16", "16:9", "1:1", "4:5"], defaultAspect: "1:1" };

export interface FormatOptions {
  /** Presets in display order, followed by "original" */
  aspects: string[];
  defaultAspect: string;
  note?: string;
}

export function getFormatOptions(platform: string, postType?: string | null): FormatOptions {
  const entry = PLATFORM_FORMATS[platform];
  const rule = (postType && entry?.byPostType?.[postType]) || entry?.fallback || GENERIC_RULE;
  return {
    aspects: [...rule.aspects.filter((a) => ASPECT_PRESETS[a]), ORIGINAL_ASPECT],
    defaultAspect: rule.defaultAspect,
    note: rule.note,
  };
}

/** Default: the platform's recommended shape with black bars, so nothing gets cut off. */
export function defaultFormat(platform: string, postType?: string | null): MediaFormat {
  return { aspect: getFormatOptions(platform, postType).defaultAspect, fit: "pad" };
}

export function isPresetAspect(aspect: string | null | undefined): aspect is string {
  return !!aspect && aspect !== ORIGINAL_ASPECT && !!ASPECT_PRESETS[aspect];
}

/** Rendered frame size for an aspect (same for images and videos), or null for "original"/unknown. */
export function targetSize(aspect: string): { width: number; height: number } | null {
  const preset = ASPECT_PRESETS[aspect];
  return preset ? { width: preset.width, height: preset.height } : null;
}

/** width / height of a preset, e.g. 0.5625 for 9:16. */
export function aspectRatioValue(aspect: string): number | null {
  const size = targetSize(aspect);
  return size ? size.width / size.height : null;
}

/**
 * Dimensions a media item will have after formatting, so the composer can run
 * spec validation on what will actually be posted. Unknown source dimensions
 * stay unknown when the format is "original".
 */
export function formattedDimensions(
  media: { width?: number | null; height?: number | null; kind?: "image" | "video" },
  format: MediaFormat | null | undefined
): { width: number | null; height: number | null } {
  if (!format || !isPresetAspect(format.aspect)) {
    return { width: media.width ?? null, height: media.height ?? null };
  }
  if (sourceMatchesAspect(media, format.aspect)) {
    return { width: media.width ?? null, height: media.height ?? null };
  }
  const size = targetSize(format.aspect)!;
  return { width: size.width, height: size.height };
}

/** True when the source already has the target shape (within 1%), so no copy is needed. */
export function sourceMatchesAspect(media: { width?: number | null; height?: number | null }, aspect: string): boolean {
  const target = aspectRatioValue(aspect);
  if (!target || !media.width || !media.height) return false;
  return Math.abs(media.width / media.height - target) / target < 0.01;
}

/** Read and sanitize post.platformSettings.mediaFormat; null when absent or invalid. */
export function readMediaFormat(settings: unknown): MediaFormat | null {
  if (!settings || typeof settings !== "object") return null;
  const raw = (settings as Record<string, unknown>).mediaFormat;
  if (!raw || typeof raw !== "object") return null;
  const { aspect, fit, focus } = raw as Record<string, unknown>;
  if (typeof aspect !== "string") return null;
  if (aspect !== ORIGINAL_ASPECT && !ASPECT_PRESETS[aspect]) return null;
  const cleanFocus: Record<string, FocusPoint> = {};
  if (focus && typeof focus === "object") {
    for (const [url, point] of Object.entries(focus as Record<string, unknown>)) {
      const p = point as Partial<FocusPoint> | null;
      if (p && typeof p.x === "number" && typeof p.y === "number") {
        cleanFocus[url] = { x: clampFocus(p.x), y: clampFocus(p.y) };
      }
    }
  }
  return { aspect, fit: fit === "crop" ? "crop" : "pad", focus: cleanFocus };
}

/** Clamp to 0..1 and round to 3 decimals, so the same point always maps to the same rendition. */
export function clampFocus(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;
}

export function focusFor(format: MediaFormat, url: string): FocusPoint {
  // Black bars keep the whole frame, so focus doesn't matter; normalize it so
  // every padded request for a source shares one rendition.
  if (format.fit === "pad") return { x: 0.5, y: 0.5 };
  const point = format.focus?.[url];
  return point ? { x: clampFocus(point.x), y: clampFocus(point.y) } : { x: 0.5, y: 0.5 };
}
