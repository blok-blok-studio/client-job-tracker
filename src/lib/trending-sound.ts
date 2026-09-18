/** Shared rules for saved trending sounds (API + composer). */

export const SOUND_PLATFORMS = ["INSTAGRAM", "TIKTOK"] as const;
export type SoundPlatform = (typeof SOUND_PLATFORMS)[number];

const HOSTS: Record<SoundPlatform, RegExp> = {
  INSTAGRAM: /(^|\.)instagram\.com$/i,
  TIKTOK: /(^|\.)tiktok\.com$/i,
};

/** Which app a sound link belongs to, or null when it isn't an Instagram / TikTok link. */
export function platformFromSoundUrl(raw: string): SoundPlatform | null {
  let host: string;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return null;
    host = url.hostname;
  } catch {
    return null;
  }
  return SOUND_PLATFORMS.find((p) => HOSTS[p].test(host)) ?? null;
}

/** What a post keeps about its assigned sound, in platformSettings.trendingSound. */
export interface AssignedSound {
  id: string;
  name: string;
  artist?: string | null;
  url: string;
  platform: SoundPlatform;
}

/** Read platformSettings.trendingSound; null when absent or malformed. */
export function readAssignedSound(settings: unknown): AssignedSound | null {
  const s = (settings as Record<string, unknown> | null)?.trendingSound as Record<string, unknown> | undefined;
  if (!s || typeof s.name !== "string" || typeof s.url !== "string") return null;
  const platform = platformFromSoundUrl(s.url);
  if (!platform) return null;
  return {
    id: typeof s.id === "string" ? s.id : "",
    name: s.name,
    artist: typeof s.artist === "string" ? s.artist : null,
    url: s.url,
    platform,
  };
}
