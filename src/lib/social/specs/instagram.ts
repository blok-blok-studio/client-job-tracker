import type { PlatformSpec, SpecInput, SpecIssue } from "./types";

/**
 * Instagram publishing rules (Instagram Platform content publishing docs,
 * checked Sept 2026): JPEG images only (we convert others at publish time),
 * 8 MB images at 4:5 to 1.91:1, carousels of up to 10 items, Reels 3 s to
 * 15 min and 300 MB, story videos 3 to 60 s and 100 MB, captions of 2200
 * characters / 30 hashtags / 20 @ tags, up to 3 collaborators (not stories).
 */

export const INSTAGRAM_LIMITS = {
  caption: 2200,
  hashtags: 30,
  mentions: 20,
  collaborators: 3,
  altText: 1000,
  carouselMax: 10,
  imageBytes: 8 * 1024 * 1024,
  imageMinWidth: 320,
  imageMinRatio: 4 / 5,
  imageMaxRatio: 1.91,
  reelMinSec: 3,
  reelMaxSec: 15 * 60,
  reelBytes: 300 * 1024 * 1024,
  storyVideoMaxSec: 60,
  storyVideoBytes: 100 * 1024 * 1024,
} as const;

export const INSTAGRAM_TRIAL_GRADUATION = ["MANUAL", "SS_PERFORMANCE"] as const;

const MB = 1024 * 1024;

function captionText(input: SpecInput): string {
  const tags = (input.hashtags || []).map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  return [input.body || "", tags].filter(Boolean).join("\n\n");
}

function defaultPostType(input: SpecInput): string {
  if (input.media.length >= 2) return "carousel";
  if (input.media[0]?.kind === "video") return "reel";
  return "feed";
}

function ratioOf(m: { width?: number | null; height?: number | null }): number | null {
  return m.width && m.height ? m.width / m.height : null;
}

function isNearVertical(ratio: number | null): boolean {
  return ratio === null || Math.abs(ratio - 9 / 16) < 0.02;
}

function validate(input: SpecInput): SpecIssue[] {
  const issues: SpecIssue[] = [];
  const L = INSTAGRAM_LIMITS;
  const type = input.postType || defaultPostType(input);
  const media = input.media;
  const images = media.filter((m) => m.kind === "image");
  const videos = media.filter((m) => m.kind === "video");
  const isReel = type === "reel" || type === "trial_reel";

  // Media counts and kinds per post type
  if (media.length === 0) {
    issues.push({ level: "error", field: "media", message: "Instagram posts need at least one image or video." });
  } else if (type === "feed") {
    if (media.length > 1) issues.push({ level: "error", field: "media", message: "A feed post takes one image. Switch to Carousel for more." });
    if (videos.length) issues.push({ level: "warning", field: "media", message: "Single videos publish as Reels." });
  } else if (type === "carousel") {
    if (media.length < 2) issues.push({ level: "error", field: "media", message: "A carousel needs at least 2 items." });
    if (media.length > L.carouselMax) {
      issues.push({ level: "error", field: "media", message: `Instagram carousels take up to ${L.carouselMax} items. Remove ${media.length - L.carouselMax}.` });
    }
  } else if (isReel) {
    if (videos.length !== 1 || images.length) {
      issues.push({ level: "error", field: "media", message: "A Reel takes exactly one video." });
    }
  } else if (type === "story") {
    if (media.length !== 1) issues.push({ level: "error", field: "media", message: "A story takes one image or one video." });
  }

  // Images
  for (const img of images) {
    const ratio = ratioOf(img);
    if (type !== "story" && ratio !== null && (ratio < L.imageMinRatio - 0.01 || ratio > L.imageMaxRatio + 0.01)) {
      issues.push({
        level: "error",
        field: "media",
        message: "Instagram only accepts feed and carousel images between 4:5 (portrait) and 1.91:1 (landscape). Crop this image.",
      });
    }
    if (img.width && img.width < L.imageMinWidth) {
      issues.push({ level: "error", field: "media", message: `Images must be at least ${L.imageMinWidth}px wide.` });
    }
    const isJpeg = img.mimeType ? img.mimeType === "image/jpeg" : /\.jpe?g(\?|#|$)/i.test(img.url);
    if (!isJpeg || (img.size && img.size > L.imageBytes)) {
      issues.push({
        level: "warning",
        field: "media",
        message: "Instagram only takes JPEGs under 8 MB, so a JPEG copy is made when it publishes. Your original stays as uploaded.",
      });
    }
    if (type === "story" && !isNearVertical(ratio)) {
      issues.push({ level: "warning", field: "media", message: "Stories look best at 9:16. Other sizes get letterboxed." });
    }
  }

  // Videos
  for (const vid of videos) {
    if (isReel) {
      if (vid.duration != null && vid.duration < L.reelMinSec) {
        issues.push({ level: "error", field: "media", message: "Reels must be at least 3 seconds long." });
      }
      if (vid.duration != null && vid.duration > L.reelMaxSec) {
        issues.push({ level: "error", field: "media", message: "Reels can be up to 15 minutes long." });
      }
      if (vid.size && vid.size > L.reelBytes) {
        issues.push({ level: "error", field: "media", message: `Reel videos must be under 300 MB (this one is ${Math.round(vid.size / MB)} MB).` });
      }
      if (!isNearVertical(ratioOf(vid))) {
        issues.push({ level: "warning", field: "media", message: "Reels look best at 9:16 vertical." });
      }
    } else if (type === "story") {
      if (vid.duration != null && (vid.duration < 3 || vid.duration > L.storyVideoMaxSec)) {
        issues.push({ level: "error", field: "media", message: "Story videos must be 3 to 60 seconds long." });
      }
      if (vid.size && vid.size > L.storyVideoBytes) {
        issues.push({ level: "error", field: "media", message: "Story videos must be under 100 MB." });
      }
    } else if (type === "carousel") {
      if (vid.duration != null && vid.duration > 60) {
        issues.push({ level: "warning", field: "media", message: "Carousel videos over 60 seconds may be rejected by Instagram." });
      }
      if (vid.size && vid.size > L.reelBytes) {
        issues.push({ level: "error", field: "media", message: "Carousel videos must be under 300 MB." });
      }
    }
  }

  // Caption
  const caption = captionText(input);
  if (type !== "story") {
    if (caption.length > L.caption) {
      issues.push({ level: "error", field: "body", message: `Caption is ${caption.length} characters. Instagram allows ${L.caption}.` });
    }
    const hashtagCount = new Set((caption.match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.toLowerCase())).size;
    if (hashtagCount > L.hashtags) {
      issues.push({ level: "error", field: "hashtags", message: `${hashtagCount} hashtags. Instagram allows ${L.hashtags}.` });
    }
    const mentionCount = (caption.match(/@[\w.]+/g) || []).length;
    if (mentionCount > L.mentions) {
      issues.push({ level: "error", field: "body", message: `${mentionCount} @ tags. Instagram allows ${L.mentions}.` });
    }
  } else if (caption.trim()) {
    issues.push({ level: "warning", field: "body", message: "Stories don't show a caption. Add text on the image or video instead." });
  }

  // Extras
  if (type === "story" && input.firstComment?.trim()) {
    issues.push({ level: "error", field: "firstComment", message: "Stories can't have a first comment." });
  }
  if (input.firstComment && input.firstComment.length > L.caption) {
    issues.push({ level: "error", field: "firstComment", message: `First comment can be up to ${L.caption} characters.` });
  }
  const collaborators = input.collaborators || [];
  if (collaborators.length && type === "story") {
    issues.push({ level: "error", field: "collaborators", message: "Stories can't have collaborators." });
  } else if (collaborators.length > L.collaborators) {
    issues.push({ level: "error", field: "collaborators", message: `Instagram allows up to ${L.collaborators} collaborators.` });
  }
  const brandPartners = Array.isArray(input.settings?.brandPartners) ? (input.settings!.brandPartners as string[]) : [];
  if (brandPartners.length > 2) {
    issues.push({ level: "error", field: "settings.brandPartners", message: "Instagram allows up to 2 brand partners." });
  }
  if (type === "story" && (input.settings?.paidPartnership || input.settings?.aiGenerated)) {
    issues.push({ level: "warning", field: "settings", message: "Paid partnership and AI labels are left off stories." });
  }
  if (input.altText && input.altText.length > L.altText) {
    issues.push({ level: "error", field: "altText", message: `Alt text can be up to ${L.altText} characters.` });
  }
  if (input.altText?.trim() && images.length === 0) {
    issues.push({ level: "warning", field: "altText", message: "Instagram only uses alt text on images." });
  }
  if (input.coverImageUrl && !isReel) {
    issues.push({ level: "warning", field: "coverImageUrl", message: "Custom covers only apply to Reels." });
  }
  if (type === "trial_reel") {
    const grad = input.settings?.trialGraduation;
    if (grad != null && !(INSTAGRAM_TRIAL_GRADUATION as readonly unknown[]).includes(grad)) {
      issues.push({ level: "error", field: "settings.trialGraduation", message: "Pick how the trial Reel graduates: manually, or automatically if it performs well." });
    }
  }

  // One message per problem, even when several items trip it
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.level}|${i.field}|${i.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const instagramSpec: PlatformSpec = {
  platform: "INSTAGRAM",
  label: "Instagram",
  postTypes: [
    { key: "feed", label: "Feed post", media: "image", minMedia: 1, maxMedia: 1 },
    { key: "carousel", label: "Carousel", media: "mixed", minMedia: 2, maxMedia: INSTAGRAM_LIMITS.carouselMax },
    { key: "reel", label: "Reel", media: "video", minMedia: 1, maxMedia: 1 },
    { key: "trial_reel", label: "Trial Reel", media: "video", minMedia: 1, maxMedia: 1 },
    { key: "story", label: "Story", media: "mixed", minMedia: 1, maxMedia: 1 },
  ],
  limits: { body: INSTAGRAM_LIMITS.caption, hashtags: INSTAGRAM_LIMITS.hashtags, firstComment: INSTAGRAM_LIMITS.caption },
  defaultPostType,
  validate,
};
