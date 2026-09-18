/** Shared shapes for the post composer. */

export type ConnectionHealth = "ok" | "expiring" | "expired" | "needs_reconnect" | "unknown";

/** One row from GET /api/social/connections, or the built-in manual RedNote account. */
export interface ComposerAccount {
  /** credential id, or MANUAL_REDNOTE_KEY */
  key: string;
  credentialId: string | null;
  platform: string;
  label: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  health: ConnectionHealth;
  reconnectProvider?: string | null;
  expiresAt?: string | null;
  /** RedNote: no API, always posted by hand */
  manualOnly?: boolean;
}

export const MANUAL_REDNOTE_KEY = "manual:REDNOTE";

/** What we know about a piece of media; fed into the platform specs. */
export interface MediaMeta {
  url: string;
  /** ClientMedia row id, when the file is in the client's library */
  id?: string;
  kind: "image" | "video" | "audio" | "document";
  filename?: string;
  mimeType?: string | null;
  size?: number | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  thumbnailUrl?: string | null;
  /** Browser-friendly copy of a video, when one was made */
  playbackUrl?: string | null;
}

/** Per-account state. Unset overrides fall back to the shared content. */
export interface AccountDraft {
  key: string;
  credentialId: string | null;
  platform: string;
  /** Existing post row when editing */
  postId?: string;
  status?: string;
  externalUrl?: string | null;
  publishError?: string | null;
  publishPhase?: string | null;

  overrideCaption: boolean;
  title: string;
  body: string;
  hashtags: string[];

  overrideMedia: boolean;
  /** Subset of the shared media, in shared order */
  mediaUrls: string[];

  /** null = let the spec pick from the media */
  postType: string | null;
  settings: Record<string, unknown>;

  firstComment: string;
  collaborators: string[];
  taggedUsers: string[];
  coverImageUrl: string;
  thumbnailUrl: string;

  publishMode: "AUTO" | "ASSISTED";
  assignedToId: string | null;
}

export interface SharedContent {
  title: string;
  body: string;
  hashtags: string[];
  mediaUrls: string[];
  /** alt text per image url */
  altTexts: Record<string, string>;
}

export interface TeamMember {
  id: string;
  name: string;
  color?: string | null;
  jobRole?: string | null;
}

export interface ClientOption {
  id: string;
  name: string;
  timezone?: string | null;
}

/** Statuses the composer can't change: the publisher owns them. */
export const LOCKED_STATUSES = ["PUBLISHING", "PUBLISHED"];

export function isLocked(draft: Pick<AccountDraft, "status">): boolean {
  return !!draft.status && LOCKED_STATUSES.includes(draft.status);
}

export function newDraft(account: ComposerAccount): AccountDraft {
  const manual = account.manualOnly || account.platform === "REDNOTE";
  return {
    key: account.key,
    credentialId: account.credentialId,
    platform: account.platform,
    overrideCaption: false,
    title: "",
    body: "",
    hashtags: [],
    overrideMedia: false,
    mediaUrls: [],
    postType: null,
    settings: {},
    firstComment: "",
    collaborators: [],
    taggedUsers: [],
    coverImageUrl: "",
    thumbnailUrl: "",
    publishMode: manual ? "ASSISTED" : "AUTO",
    assignedToId: null,
  };
}

export const PLATFORM_NAMES: Record<string, string> = {
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  REDNOTE: "RedNote",
  FACEBOOK: "Facebook",
  LINKEDIN: "LinkedIn",
  TWITTER: "X",
  THREADS: "Threads",
};

export function platformName(platform: string): string {
  return PLATFORM_NAMES[platform] || platform;
}

/** Rough caption limits for platforms that don't have a spec file. */
export const FALLBACK_BODY_LIMITS: Record<string, number> = {
  TWITTER: 280,
  THREADS: 500,
  LINKEDIN: 3000,
  FACEBOOK: 63206,
};
