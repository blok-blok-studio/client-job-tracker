import { ORIGINAL_ASPECT, defaultFormat, formattedDimensions, isPresetAspect, type MediaFormat } from "@/lib/social/formats";
import { validateForPlatform, type SpecMedia } from "@/lib/social/specs";
import type { AccountDraft, MediaMeta } from "./types";

const ORIGINAL_FORMAT: MediaFormat = { aspect: ORIGINAL_ASPECT, fit: "pad" };

function mediaErrors(platform: string, postType: string | null, media: SpecMedia[], settings: Record<string, unknown>): Set<string> {
  try {
    return new Set(
      validateForPlatform(platform, { postType, media, settings })
        .filter((i) => i.level === "error" && i.field === "media")
        .map((i) => i.message)
    );
  } catch {
    return new Set();
  }
}

/**
 * The format a post will use: the one picked by hand; otherwise the original
 * file, full quality, unless the platform would reject its shape and the
 * platform's standard shape fixes that.
 */
export function effectiveFormat(
  draft: Pick<AccountDraft, "platform" | "settings">,
  postType: string | null,
  media: SpecMedia[]
): MediaFormat {
  const picked = draft.settings.mediaFormat as MediaFormat | undefined;
  if (draft.settings.mediaFormatManual && picked) return picked;

  const preset = defaultFormat(draft.platform, postType);
  if (!isPresetAspect(preset.aspect) || media.length === 0) return ORIGINAL_FORMAT;

  const reshaped = media.map((m) => ({ ...m, ...formattedDimensions(m, preset) }));
  const asIs = mediaErrors(draft.platform, postType, media, draft.settings);
  const withPreset = mediaErrors(draft.platform, postType, reshaped, draft.settings);
  const shapeFixesSomething = [...asIs].some((message) => !withPreset.has(message));
  return shapeFixesSomething ? preset : ORIGINAL_FORMAT;
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
