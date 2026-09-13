import type { PlatformSpec, SpecInput, SpecIssue } from "./types";

/**
 * RedNote (Xiaohongshu / 小红书). No publishing API for non-Chinese companies,
 * so every post is ASSISTED: a teammate posts it from the handoff page.
 *
 * Limits below come from marketer guides (Sept 2026), not official docs —
 * RedNote publishes no developer spec. Treat as current best knowledge:
 *  - title 20 characters, body 1,000 characters
 *  - image notes up to 18 images, 3:4 vertical recommended
 *  - video notes: one video, up to 15 minutes; short (under ~60s) performs best
 */

const TITLE_MAX = 20;
const BODY_MAX = 1000;
const MAX_IMAGES = 18;
const MAX_VIDEO_SECONDS = 15 * 60;
/** Hashtags past this start to read as spam in-feed */
const HASHTAG_SOFT_MAX = 10;

/** RedNote counts characters, not UTF-16 units; count code points so emoji count once. */
function charCount(text: string | null | undefined): number {
  return text ? Array.from(text).length : 0;
}

function defaultPostType(input: SpecInput): string {
  return input.media.some((m) => m.kind === "video") ? "video_note" : "image_note";
}

export const rednoteSpec: PlatformSpec = {
  platform: "REDNOTE",
  label: "RedNote",
  assistedOnly: true,
  postTypes: [
    { key: "image_note", label: "Image note", media: "images", minMedia: 1, maxMedia: MAX_IMAGES },
    { key: "video_note", label: "Video note", media: "video", minMedia: 1, maxMedia: 1 },
  ],
  limits: { title: TITLE_MAX, body: BODY_MAX, hashtags: HASHTAG_SOFT_MAX },

  defaultPostType,

  validate(input: SpecInput): SpecIssue[] {
    const issues: SpecIssue[] = [];
    const postType = input.postType || defaultPostType(input);
    const images = input.media.filter((m) => m.kind === "image");
    const videos = input.media.filter((m) => m.kind === "video");

    if (input.publishMode === "AUTO") {
      issues.push({
        level: "error",
        field: "publishMode",
        message: "RedNote has no publishing API. This post has to be posted by hand.",
      });
    }

    if (!input.title?.trim()) {
      issues.push({ level: "warning", field: "title", message: "RedNote notes do better with a title (up to 20 characters)." });
    } else if (charCount(input.title) > TITLE_MAX) {
      issues.push({
        level: "error",
        field: "title",
        message: `Title is ${charCount(input.title)} characters. RedNote allows ${TITLE_MAX}.`,
      });
    }

    const bodyWithTags = [input.body || "", (input.hashtags || []).map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ")]
      .filter(Boolean)
      .join("\n\n");
    if (charCount(bodyWithTags) > BODY_MAX) {
      issues.push({
        level: "error",
        field: "body",
        message: `Text plus hashtags is ${charCount(bodyWithTags)} characters. RedNote allows ${BODY_MAX}.`,
      });
    }

    if ((input.hashtags || []).length > HASHTAG_SOFT_MAX) {
      issues.push({
        level: "warning",
        field: "hashtags",
        message: `${input.hashtags!.length} hashtags. A handful of specific ones works better on RedNote.`,
      });
    }

    if (input.media.length === 0) {
      issues.push({ level: "error", field: "media", message: "RedNote notes need at least one image or a video." });
      return issues;
    }

    if (postType === "video_note") {
      if (videos.length !== 1 || images.length > 0) {
        issues.push({ level: "error", field: "media", message: "A video note takes exactly one video and no images." });
      }
      const video = videos[0];
      if (video?.duration && video.duration > MAX_VIDEO_SECONDS) {
        issues.push({ level: "error", field: "media", message: "RedNote videos can be up to 15 minutes." });
      } else if (video?.duration && video.duration > 60) {
        issues.push({ level: "warning", field: "media", message: "Videos under a minute tend to perform best on RedNote." });
      }
      if (video?.width && video?.height && video.width > video.height) {
        issues.push({ level: "warning", field: "media", message: "This video is landscape. Vertical (3:4 or 9:16) fills the feed better." });
      }
    } else {
      if (videos.length > 0) {
        issues.push({ level: "error", field: "media", message: "An image note can't include videos. Switch to a video note." });
      }
      if (images.length > MAX_IMAGES) {
        issues.push({ level: "error", field: "media", message: `RedNote allows up to ${MAX_IMAGES} images per note.` });
      }
      const landscape = images.filter((m) => m.width && m.height && m.width > m.height).length;
      if (landscape > 0) {
        issues.push({
          level: "warning",
          field: "media",
          message: `${landscape} image${landscape === 1 ? " is" : "s are"} landscape. RedNote crops to 3:4 vertical, so check the framing.`,
        });
      }
    }

    return issues;
  },
};
