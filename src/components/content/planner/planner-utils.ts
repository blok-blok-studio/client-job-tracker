/**
 * Shared shapes and helpers for the content planner (calendar, list, status).
 * Posts made together in the composer share a groupId and render as one card.
 */

export interface PlannerPost {
  id: string;
  clientId: string;
  client: { id: string; name: string };
  credentialId: string | null;
  credential?: {
    id: string;
    label: string | null;
    platform: string;
    meta: { avatarUrl?: string; username?: string } | null;
  } | null;
  platform: string;
  status: string;
  title: string | null;
  body: string | null;
  hashtags: string[];
  mediaUrls: string[];
  coverImageUrl?: string | null;
  thumbnailUrl?: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  publishError: string | null;
  externalUrl: string | null;
  publishPhase: string | null;
  publishState: Record<string, unknown> | null;
  groupId: string | null;
  publishMode: string;
  /** Composer saves the chosen post type here as platformSettings.postType */
  platformSettings?: Record<string, unknown> | null;
  assignedToId: string | null;
  approvalStatus: string | null;
  approvalNote: string | null;
  metrics: { views?: number | null; likes?: number | null; comments?: number | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostGroup {
  key: string;
  posts: PlannerPost[];
  lead: PlannerPost;
  /** Calendar placement: scheduled time, else publish time */
  date: Date | null;
  clientName: string;
}

export type StatusKey =
  | "DRAFT"
  | "SCHEDULED"
  | "PUBLISHING"
  | "ACTION_NEEDED"
  | "PUBLISHED"
  | "FAILED"
  | "AWAITING_APPROVAL";

export const STATUS_META: Record<StatusKey, { label: string; dot: string; badge: string; text: string }> = {
  DRAFT: { label: "Draft", dot: "bg-bb-dim", badge: "bg-bb-elevated text-bb-muted border-bb-border", text: "text-bb-muted" },
  SCHEDULED: { label: "Scheduled", dot: "bg-blue-400", badge: "bg-blue-500/10 text-blue-300 border-blue-500/25", text: "text-blue-300" },
  PUBLISHING: { label: "Publishing", dot: "bg-yellow-400 animate-pulse", badge: "bg-yellow-500/10 text-yellow-300 border-yellow-500/25", text: "text-yellow-300" },
  ACTION_NEEDED: { label: "Needs posting", dot: "bg-bb-orange", badge: "bg-bb-orange/10 text-bb-orange border-bb-orange/30", text: "text-bb-orange" },
  PUBLISHED: { label: "Published", dot: "bg-emerald-400", badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25", text: "text-emerald-300" },
  FAILED: { label: "Failed", dot: "bg-red-500", badge: "bg-red-500/10 text-red-300 border-red-500/25", text: "text-red-300" },
  AWAITING_APPROVAL: { label: "Awaiting approval", dot: "bg-purple-400", badge: "bg-purple-500/10 text-purple-300 border-purple-500/25", text: "text-purple-300" },
};

export const STATUS_FILTERS: StatusKey[] = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHING",
  "ACTION_NEEDED",
  "PUBLISHED",
  "FAILED",
  "AWAITING_APPROVAL",
];

export const ALL_PLATFORMS = ["INSTAGRAM", "TIKTOK", "YOUTUBE", "REDNOTE", "LINKEDIN", "FACEBOOK", "THREADS", "TWITTER"];

/** Status as the planner shows it: an approval hold outranks "scheduled"/"draft". */
export function displayStatus(post: PlannerPost): StatusKey {
  if (
    (post.status === "SCHEDULED" || post.status === "DRAFT") &&
    (post.approvalStatus === "PENDING" || post.approvalStatus === "CHANGES_REQUESTED")
  ) {
    return "AWAITING_APPROVAL";
  }
  return (post.status in STATUS_META ? post.status : "DRAFT") as StatusKey;
}

/** Only posts nobody is currently sending can be moved or retried. */
export function isReschedulable(post: PlannerPost): boolean {
  return post.status === "DRAFT" || post.status === "SCHEDULED" || post.status === "FAILED";
}

export function postDate(post: PlannerPost): Date | null {
  const iso = post.scheduledAt || post.publishedAt;
  return iso ? new Date(iso) : null;
}

export function groupPosts(posts: PlannerPost[]): PostGroup[] {
  const map = new Map<string, PlannerPost[]>();
  for (const post of posts) {
    const key = post.groupId || post.id;
    map.set(key, [...(map.get(key) || []), post]);
  }
  return [...map.entries()].map(([key, groupPosts]) => {
    const sorted = [...groupPosts].sort((a, b) => a.platform.localeCompare(b.platform));
    const dates = sorted.map(postDate).filter((d): d is Date => !!d);
    const date = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
    return { key, posts: sorted, lead: sorted[0], date, clientName: sorted[0].client?.name || "" };
  });
}

/** 0–100 when the publish state reports progress (chunked uploads), else null. */
export function publishProgress(post: PlannerPost): number | null {
  const s = post.publishState;
  if (!s || post.status !== "PUBLISHING") return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const offset = num(s.offset) ?? num(s.bytesUploaded);
  const total = num(s.total) ?? num(s.totalBytes) ?? num(s.videoSize);
  if (offset !== null && total) return Math.max(0, Math.min(100, Math.round((offset / total) * 100)));
  const next = num(s.nextChunk) ?? num(s.chunkIndex);
  const chunks = num(s.totalChunks) ?? num(s.totalChunkCount);
  if (next !== null && chunks) return Math.max(0, Math.min(100, Math.round((next / chunks) * 100)));
  return null;
}

export function phaseLabel(post: PlannerPost): string {
  if (post.status !== "PUBLISHING") return STATUS_META[displayStatus(post)].label;
  const pct = publishProgress(post);
  if (post.publishPhase === "uploading") return pct !== null ? `Uploading ${pct}%` : "Uploading";
  if (post.publishPhase === "processing") return "Processing";
  return "Sending";
}

export function wasInterrupted(post: PlannerPost): boolean {
  return /interrupted|still (uploading|processing)|doesn't post twice|so it doesn't post twice/i.test(post.publishError || "");
}

export function postSnippet(post: PlannerPost, max = 80): string {
  const text = post.title || post.body || "";
  if (!text) return "(untitled)";
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

const VIDEO = /\.(mp4|mov|m4v|webm)(\?|#|$)/i;

export function isVideo(url: string): boolean {
  return VIDEO.test(url);
}

export type PostKindKey = "trial_reel" | "reel" | "short" | "video" | "long_video" | "carousel" | "story" | "post" | "text";

/** What a post is (reel, trial reel, carousel...), so the calendar shows the mix per day. */
export const KIND_META: Record<PostKindKey, { label: string; dot: string; tag: string }> = {
  trial_reel: { label: "Trial reel", dot: "bg-amber-400", tag: "text-amber-300 bg-amber-500/10 border-amber-500/40 border-dashed" },
  reel: { label: "Reel", dot: "bg-fuchsia-400", tag: "text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/30" },
  short: { label: "Short", dot: "bg-fuchsia-400", tag: "text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/30" },
  video: { label: "Video", dot: "bg-fuchsia-400", tag: "text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/30" },
  long_video: { label: "Long video", dot: "bg-indigo-400", tag: "text-indigo-300 bg-indigo-500/10 border-indigo-500/30" },
  carousel: { label: "Carousel", dot: "bg-cyan-400", tag: "text-cyan-300 bg-cyan-500/10 border-cyan-500/30" },
  story: { label: "Story", dot: "bg-violet-400", tag: "text-violet-300 bg-violet-500/10 border-violet-500/30" },
  post: { label: "Post", dot: "bg-zinc-300", tag: "text-zinc-200 bg-zinc-500/10 border-zinc-500/40" },
  text: { label: "Text", dot: "bg-zinc-500", tag: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30" },
};

/** Legend order; reel, short and video share a colour (the same clip cross-posted). */
export const KIND_LEGEND: PostKindKey[] = ["reel", "trial_reel", "carousel", "post", "story", "long_video", "text"];

const KIND_BY_POST_TYPE: Record<string, Record<string, PostKindKey>> = {
  INSTAGRAM: { feed: "post", carousel: "carousel", reel: "reel", trial_reel: "trial_reel", story: "story" },
  TIKTOK: { video: "video", photo: "carousel" },
  YOUTUBE: { short: "short", video: "long_video" },
  REDNOTE: { video_note: "video" },
};

export function postKind(post: PlannerPost): PostKindKey {
  const settings = post.platformSettings || {};
  const saved = typeof settings.postType === "string" ? KIND_BY_POST_TYPE[post.platform]?.[settings.postType] : undefined;
  if (saved) return saved;
  // Older posts and platforms without post types: read it off the media
  const hasVideo = post.mediaUrls.some(isVideo);
  if (post.platform === "INSTAGRAM" && settings.shareToStory === true && post.mediaUrls.length === 1) return "story";
  if (post.mediaUrls.length === 0) return "text";
  if (post.platform === "YOUTUBE") return "long_video";
  if (post.platform === "INSTAGRAM") return post.mediaUrls.length >= 2 ? "carousel" : hasVideo ? "reel" : "post";
  if (hasVideo) return "video";
  return post.mediaUrls.length >= 2 ? "carousel" : "post";
}

const CLIP_KINDS: PostKindKey[] = ["reel", "short", "video"];

/**
 * Distinct kinds across a group's accounts. A clip cross-posted as Reel + Short
 * + TikTok video counts once; a trial reel always shows and comes first.
 */
export function groupKinds(group: PostGroup): PostKindKey[] {
  const kinds = [...new Set(group.posts.map(postKind))];
  const clip = CLIP_KINDS.find((k) => kinds.includes(k));
  const order = Object.keys(KIND_META) as PostKindKey[];
  return kinds
    .filter((k) => !CLIP_KINDS.includes(k) || k === clip)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** Best still image for a post card (cover, thumbnail, or first image). */
export function postThumb(post: PlannerPost): string | null {
  if (post.coverImageUrl) return post.coverImageUrl;
  if (post.thumbnailUrl) return post.thumbnailUrl;
  const img = post.mediaUrls.find((u) => !isVideo(u) && !/\.pdf(\?|$)/i.test(u));
  return img || null;
}

export function localTimezoneLabel(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const short = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    return short ? `${tz.replace(/_/g, " ")} (${short})` : tz;
  } catch {
    return "Local time";
  }
}

/** Keep the time of day, move to another calendar day. */
export function withDay(time: Date, day: Date): Date {
  const next = new Date(day);
  next.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return next;
}
