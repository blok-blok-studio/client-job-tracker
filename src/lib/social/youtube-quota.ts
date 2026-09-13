/**
 * YouTube Data API quota tracking.
 *
 * Quota belongs to the Google Cloud project, so ONE budget is shared by every
 * client's channel. Two buckets, both resetting at midnight Pacific time
 * (Google docs, checked Sept 2026):
 *  - Video uploads: videos.insert costs 1 call from its own bucket, 100 calls a day by default.
 *  - Everything else: 10,000 units a day (thumbnails.set 50, playlistItems.insert 50,
 *    playlistItems.list 1, videos.list 1).
 *
 * Usage is counted in the Setting table under `youtube_quota:<YYYY-MM-DD>`
 * (Pacific date) as { used, uploads }. This is our own tally of calls we made,
 * not Google's number, so it's a guard rail rather than an exact mirror.
 */

import prisma from "@/lib/prisma";
import { PublishValidationError } from "@/lib/social/types";

export const YOUTUBE_UNIT_COST = {
  thumbnailsSet: 50,
  playlistItemsInsert: 50,
  playlistItemsList: 1,
  videosList: 1,
} as const;

const PACIFIC = "America/Los_Angeles";

function uploadLimit(): number {
  const n = Number(process.env.YOUTUBE_DAILY_UPLOADS);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

function unitLimit(): number {
  const n = Number(process.env.YOUTUBE_DAILY_QUOTA);
  return Number.isFinite(n) && n > 0 ? n : 10_000;
}

/** Pacific calendar date parts for an instant. */
function pacificParts(at: Date): { y: number; m: number; d: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), hour: get("hour") };
}

function quotaKey(at = new Date()): string {
  const { y, m, d } = pacificParts(at);
  return `youtube_quota:${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Next midnight Pacific as a UTC instant (handles PST/PDT). */
export function nextPacificMidnight(at = new Date()): Date {
  const { y, m, d } = pacificParts(at);
  // Midnight PST is 08:00 UTC; during PDT the same instant reads 01:00 Pacific
  let guess = new Date(Date.UTC(y, m - 1, d + 1, 8, 0, 0));
  if (pacificParts(guess).hour === 1) guess = new Date(guess.getTime() - 60 * 60 * 1000);
  return guess;
}

async function readUsage(): Promise<{ used: number; uploads: number }> {
  const row = await prisma.setting.findUnique({ where: { key: quotaKey() } });
  const value = (row?.value as { used?: number; uploads?: number } | null) || {};
  return { used: Number(value.used) || 0, uploads: Number(value.uploads) || 0 };
}

/** Add to today's tally. Atomic in SQL so overlapping runner steps don't lose counts. */
export async function recordYouTubeUsage(delta: { units?: number; uploads?: number }): Promise<void> {
  const units = Math.max(0, Math.round(delta.units || 0));
  const uploads = Math.max(0, Math.round(delta.uploads || 0));
  if (units === 0 && uploads === 0) return;
  await prisma.$executeRaw`
    INSERT INTO "Setting" ("key", "value", "updatedBy", "updatedAt")
    VALUES (${quotaKey()}, jsonb_build_object('used', ${units}::int, 'uploads', ${uploads}::int), 'youtube', NOW())
    ON CONFLICT ("key") DO UPDATE SET
      "value" = jsonb_build_object(
        'used', COALESCE(("Setting"."value"->>'used')::int, 0) + ${units}::int,
        'uploads', COALESCE(("Setting"."value"->>'uploads')::int, 0) + ${uploads}::int
      ),
      "updatedAt" = NOW()
  `.catch((err) => console.error("[YouTube quota] Failed to record usage:", (err as Error).message));
}

export interface YouTubeQuotaStatus {
  /** General units used today (thumbnails, playlists, stats) */
  used: number;
  limit: number;
  uploadsUsed: number;
  uploadsLimit: number;
  /** Uploads still possible today across ALL clients */
  uploadsLeft: number;
  resetsAt: string;
}

export async function getYouTubeQuotaStatus(): Promise<YouTubeQuotaStatus> {
  const { used, uploads } = await readUsage();
  const limit = unitLimit();
  const uploadsLimit = uploadLimit();
  return {
    used,
    limit,
    uploadsUsed: uploads,
    uploadsLimit,
    uploadsLeft: Math.max(0, uploadsLimit - uploads),
    resetsAt: nextPacificMidnight().toISOString(),
  };
}

/** Throw a user-facing error when today's upload bucket is spent. */
export async function assertUploadFits(): Promise<void> {
  const status = await getYouTubeQuotaStatus();
  if (status.uploadsLeft > 0) return;
  const resets = new Date(status.resetsAt).toLocaleString("en-US", {
    timeZone: PACIFIC,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  throw new PublishValidationError(
    `YouTube's daily upload limit is used up (${status.uploadsUsed} of ${status.uploadsLimit} uploads today, shared by every client). It resets at ${resets}. Reschedule this post for after that.`
  );
}

/** True when a general-units call of this cost still fits today. */
export async function unitsFit(cost: number): Promise<boolean> {
  const { used } = await readUsage();
  return used + cost <= unitLimit();
}
