/**
 * Per-platform post rules, shared by the composer (live checks before
 * scheduling) and adapters (last-line validation). Each platform file exports
 * a PlatformSpec; index.ts collects them.
 */

export type MediaKind = "image" | "video";

export interface SpecMedia {
  url: string;
  kind: MediaKind;
  width?: number | null;
  height?: number | null;
  /** seconds */
  duration?: number | null;
  /** bytes */
  size?: number | null;
  mimeType?: string | null;
}

export interface SpecInput {
  /** One of the platform's postTypes[].key */
  postType?: string | null;
  title?: string | null;
  body?: string | null;
  hashtags?: string[];
  media: SpecMedia[];
  settings?: Record<string, unknown>;
  firstComment?: string | null;
  collaborators?: string[];
  taggedUsers?: string[];
  altText?: string | null;
  coverImageUrl?: string | null;
  thumbnailUrl?: string | null;
  publishMode?: "AUTO" | "ASSISTED";
  scheduledAt?: string | null;
}

export interface SpecIssue {
  level: "error" | "warning";
  /** Composer field to highlight: "title" | "body" | "media" | "settings.<key>" | ... */
  field?: string;
  message: string;
}

export interface PostTypeOption {
  key: string;
  label: string;
  /** What media this type takes */
  media: "none" | "image" | "video" | "images" | "mixed";
  minMedia: number;
  maxMedia: number;
}

export interface PlatformSpec {
  platform: string;
  label: string;
  postTypes: PostTypeOption[];
  /** Field limits the composer shows as counters */
  limits: { title?: number; body?: number; hashtags?: number; firstComment?: number };
  /** Posts on this platform can only be ASSISTED (no publishing API) */
  assistedOnly?: boolean;
  /** Infer a default post type from media (e.g. vertical ≤3 min video → Short) */
  defaultPostType(input: SpecInput): string;
  validate(input: SpecInput): SpecIssue[];
}
