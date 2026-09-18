import type { PlatformSpec, SpecInput, SpecIssue } from "./types";

/**
 * TikTok Content Posting API (Direct Post) rules, checked against
 * developers.tiktok.com (Sept 2026): photo title ≤90 and description ≤4000
 * UTF-16 units, video caption ≤2200, up to 35 JPEG/WebP photos (20MB each,
 * 1080p max), video files up to 4GB.
 *
 * TikTok's content sharing guidelines also dictate parts of the composer UX.
 * The strings below are what the composer must show, word for word.
 */

export const TIKTOK_PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

/** Shown next to the post button when branded content is off. */
export const TIKTOK_CONSENT_MUSIC = "By posting, you agree to TikTok's Music Usage Confirmation.";
/** Shown instead when branded content is on (alone or with "Your brand"). */
export const TIKTOK_CONSENT_BRANDED =
  "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.";
export const TIKTOK_MUSIC_USAGE_URL = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
export const TIKTOK_BRANDED_CONTENT_POLICY_URL = "https://www.tiktok.com/legal/page/global/bc-policy/en";

export const TIKTOK_LABEL_YOUR_BRAND = "Your photo/video will be labeled as 'Promotional content'";
export const TIKTOK_LABEL_BRANDED = "Your photo/video will be labeled as 'Paid partnership'";
/** Shown when branded content is on and "Only me" is picked or disabled. */
export const TIKTOK_BRANDED_PRIVATE_NOTICE = "Branded content visibility cannot be set to private.";
/** Shown after posting. */
export const TIKTOK_PROCESSING_NOTICE =
  "It may take a few minutes for the content to process and be visible on the profile.";

export const TIKTOK_TITLE_MAX = 90;
export const TIKTOK_PHOTO_DESCRIPTION_MAX = 4000;
export const TIKTOK_VIDEO_CAPTION_MAX = 2200;
export const TIKTOK_MAX_PHOTOS = 35;
const PHOTO_MAX_BYTES = 20 * 1024 * 1024;
const VIDEO_MAX_BYTES = 4 * 1024 * 1024 * 1024;

/** Which consent sentence applies to these settings. */
export function tiktokConsentText(settings: Record<string, unknown> = {}): string {
  return settings.brandedContent ? TIKTOK_CONSENT_BRANDED : TIKTOK_CONSENT_MUSIC;
}

/** The label notice for the chosen disclosure options, or null when none apply. */
export function tiktokDisclosureLabel(settings: Record<string, unknown> = {}): string | null {
  if (settings.brandedContent) return TIKTOK_LABEL_BRANDED;
  if (settings.brandOrganic) return TIKTOK_LABEL_YOUR_BRAND;
  return null;
}

function tagString(hashtags: string[] = []): string {
  return hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
}

/** Caption TikTok receives: body plus hashtags. Shared with the adapter so counts match. */
export function tiktokCaption(body: string | null | undefined, hashtags: string[] = []): string {
  return [body || "", tagString(hashtags)].filter(Boolean).join(" ").trim();
}

function isTikTokPhotoFormat(url: string, mimeType?: string | null): boolean {
  if (mimeType) return /^image\/(jpeg|jpg|webp)$/i.test(mimeType);
  return /\.(jpe?g|webp)(\?|#|$)/i.test(url);
}

export const tiktokSpec: PlatformSpec = {
  platform: "TIKTOK",
  label: "TikTok",
  postTypes: [
    { key: "video", label: "Video", media: "video", minMedia: 1, maxMedia: 1 },
    { key: "photo", label: "Photo carousel", media: "images", minMedia: 1, maxMedia: TIKTOK_MAX_PHOTOS },
  ],
  limits: { title: TIKTOK_TITLE_MAX, body: TIKTOK_VIDEO_CAPTION_MAX },

  defaultPostType(input: SpecInput): string {
    return input.media.some((m) => m.kind === "video") ? "video" : "photo";
  },

  validate(input: SpecInput): SpecIssue[] {
    const issues: SpecIssue[] = [];
    const settings = input.settings || {};
    const postType = input.postType || tiktokSpec.defaultPostType(input);
    const videos = input.media.filter((m) => m.kind === "video");
    const images = input.media.filter((m) => m.kind === "image");

    if (postType !== "video" && postType !== "photo") {
      issues.push({ level: "error", field: "postType", message: "Pick Video or Photo carousel for TikTok." });
      return issues;
    }

    if (postType === "video") {
      if (videos.length !== 1 || images.length > 0) {
        issues.push({ level: "error", field: "media", message: "A TikTok video post needs exactly one video and no photos." });
      }
      const video = videos[0];
      if (video) {
        const max = typeof settings.maxVideoPostDurationSec === "number" ? settings.maxVideoPostDurationSec : null;
        if (video.duration != null && max != null && video.duration > max) {
          issues.push({
            level: "error",
            field: "media",
            message: `This account can post videos up to ${Math.floor(max)} seconds. This one is ${Math.round(video.duration)} seconds.`,
          });
        }
        if (video.duration != null && video.duration < 3) {
          issues.push({ level: "warning", field: "media", message: "TikTok may reject videos shorter than 3 seconds." });
        }
        if (video.size != null && video.size > VIDEO_MAX_BYTES) {
          issues.push({ level: "error", field: "media", message: "TikTok accepts video files up to 4GB." });
        }
        if (video.width && video.height && video.width >= video.height) {
          issues.push({ level: "warning", field: "media", message: "TikTok is built for vertical video (9:16). This one is horizontal or square." });
        }
      }
      const caption = tiktokCaption(input.body, input.hashtags);
      if (caption.length > TIKTOK_VIDEO_CAPTION_MAX) {
        issues.push({
          level: "error",
          field: "body",
          message: `TikTok captions max out at ${TIKTOK_VIDEO_CAPTION_MAX} characters including hashtags (${caption.length} now).`,
        });
      }
      if (input.title) {
        issues.push({ level: "warning", field: "title", message: "TikTok videos have no separate title. Only the caption is posted." });
      }
    } else {
      if (videos.length > 0) {
        issues.push({ level: "error", field: "media", message: "A TikTok photo post can't include videos. Switch to Video or remove them." });
      }
      if (images.length < 1) {
        issues.push({ level: "error", field: "media", message: "Add at least one photo." });
      }
      if (images.length > TIKTOK_MAX_PHOTOS) {
        issues.push({ level: "error", field: "media", message: `TikTok allows up to ${TIKTOK_MAX_PHOTOS} photos per post.` });
      }
      for (const img of images) {
        if (!isTikTokPhotoFormat(img.url, img.mimeType)) {
          issues.push({ level: "error", field: "media", message: "TikTok only accepts JPEG or WebP photos. Swap out the other formats." });
          break;
        }
      }
      if (images.some((img) => img.size != null && img.size > PHOTO_MAX_BYTES)) {
        issues.push({ level: "error", field: "media", message: "Each TikTok photo must be 20MB or smaller." });
      }
      if (images.some((img) => img.width && img.height && Math.min(img.width, img.height) > 1080)) {
        issues.push({ level: "warning", field: "media", message: "TikTok lists 1080p as the maximum photo resolution. Larger photos may be rejected." });
      }
      if ((input.title || "").length > TIKTOK_TITLE_MAX) {
        issues.push({ level: "error", field: "title", message: `TikTok photo titles max out at ${TIKTOK_TITLE_MAX} characters.` });
      }
      const description = tiktokCaption(input.body, input.hashtags);
      if (description.length > TIKTOK_PHOTO_DESCRIPTION_MAX) {
        issues.push({
          level: "error",
          field: "body",
          message: `TikTok photo descriptions max out at ${TIKTOK_PHOTO_DESCRIPTION_MAX} characters including hashtags.`,
        });
      }
      const cover = settings.photoCoverIndex;
      if (typeof cover === "number" && (cover < 0 || cover >= images.length)) {
        issues.push({ level: "error", field: "settings.photoCoverIndex", message: "The cover photo must be one of the photos in this post." });
      }
    }

    // Guideline rules only apply when the API posts it; manual posts and drafts are finished in the app.
    if (input.publishMode !== "ASSISTED" && settings.tiktokDraft !== true) {
      const privacy = settings.privacyLevel as string | undefined;
      const options = Array.isArray(settings.privacyLevelOptions) ? (settings.privacyLevelOptions as string[]) : null;
      if (!privacy) {
        issues.push({ level: "error", field: "settings.privacyLevel", message: "Choose who can view this TikTok." });
      } else if (options && !options.includes(privacy)) {
        issues.push({ level: "error", field: "settings.privacyLevel", message: "That visibility isn't available for this account. Pick another." });
      }
      if (settings.brandedContent && privacy === "SELF_ONLY") {
        issues.push({ level: "error", field: "settings.privacyLevel", message: TIKTOK_BRANDED_PRIVATE_NOTICE });
      }
      if (settings.discloseCommercial && !settings.brandOrganic && !settings.brandedContent) {
        issues.push({
          level: "error",
          field: "settings.discloseCommercial",
          message: "You turned on content disclosure. Choose Your brand, Branded content, or both.",
        });
      }
    }

    if (input.firstComment) {
      issues.push({ level: "warning", field: "firstComment", message: "TikTok's API can't post a first comment. It will be skipped." });
    }
    if ((input.collaborators || []).length > 0 || (input.taggedUsers || []).length > 0) {
      issues.push({ level: "warning", field: "collaborators", message: "TikTok's API doesn't support tagging or collaborators. They will be skipped." });
    }

    return issues;
  },
};
