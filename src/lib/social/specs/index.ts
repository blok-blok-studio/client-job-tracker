import type { PlatformSpec, SpecInput, SpecIssue } from "./types";
import { youtubeSpec } from "./youtube";
import { instagramSpec } from "./instagram";
import { tiktokSpec } from "./tiktok";
import { rednoteSpec } from "./rednote";

export * from "./types";

export const PLATFORM_SPECS: Record<string, PlatformSpec> = {
  YOUTUBE: youtubeSpec,
  INSTAGRAM: instagramSpec,
  TIKTOK: tiktokSpec,
  REDNOTE: rednoteSpec,
};

export function getSpec(platform: string): PlatformSpec | undefined {
  return PLATFORM_SPECS[platform];
}

/** Issues for one platform; platforms without a spec (X, LinkedIn...) return []. */
export function validateForPlatform(platform: string, input: SpecInput): SpecIssue[] {
  return getSpec(platform)?.validate(input) ?? [];
}
