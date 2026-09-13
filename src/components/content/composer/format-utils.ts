import { defaultFormat, formattedDimensions, type MediaFormat } from "@/lib/social/formats";
import type { AccountDraft, MediaMeta } from "./types";

/** The format a post will use: the one picked by hand, else the platform default for its post type. */
export function effectiveFormat(draft: Pick<AccountDraft, "platform" | "settings">, postType: string | null): MediaFormat {
  const picked = draft.settings.mediaFormat as MediaFormat | undefined;
  if (draft.settings.mediaFormatManual && picked) return picked;
  return defaultFormat(draft.platform, postType);
}

/** Media dimensions after formatting, so aspect checks judge what will actually be posted. */
export function formattedMeta(meta: Record<string, MediaMeta>, urls: string[], format: MediaFormat): Record<string, MediaMeta> {
  const out: Record<string, MediaMeta> = { ...meta };
  for (const url of urls) {
    const m = meta[url];
    if (!m || (m.kind !== "image" && m.kind !== "video")) continue;
    try {
      const dims = formattedDimensions({ width: m.width ?? null, height: m.height ?? null, kind: m.kind }, format);
      if (dims?.width && dims?.height) out[url] = { ...m, width: dims.width, height: dims.height };
    } catch {
      /* unknown dimensions: leave as-is */
    }
  }
  return out;
}
