/**
 * Formatted copies of post media (see src/lib/social/formats.ts).
 *
 * A post that asks for, say, 9:16 with black bars gets one MediaRendition row
 * per media item. The per-minute render cron turns PENDING rows into Blob files
 * (sharp for images, the bundled ffmpeg for video); the publisher waits until
 * every row is READY and then posts the rendition URLs instead of the
 * originals. Originals are never modified, and a rendition is reused by every
 * post that asks for the same source + format.
 */

import { spawn } from "child_process";
import { createReadStream } from "fs";
import { mkdir, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { put } from "@vercel/blob";
import type { ContentPost, MediaRendition } from "@prisma/client";
import prisma from "@/lib/prisma";
import { fetchBlobBounded, isAllowedBlobUrl } from "@/lib/blob-fetch";
import { isImageUrl, isVideoUrl } from "@/lib/social/media";
import {
  aspectRatioValue,
  focusFor,
  isPresetAspect,
  readMediaFormat,
  sourceMatchesAspect,
  targetSize,
  type FitMode,
  type MediaFormat,
} from "@/lib/social/formats";

const MAX_ATTEMPTS = 3;
/** Never start a video with less run time left than this. */
const MIN_VIDEO_BUDGET_MS = 5 * 60 * 1000;
/** Rough encode speed on a Vercel function: seconds of work per second of video, plus upload slack. */
const VIDEO_SECONDS_PER_SECOND = 1.5;
const VIDEO_FIXED_OVERHEAD_MS = 90_000;
const MAX_IMAGE_SOURCE_BYTES = 100 * 1024 * 1024;
/** Vercel's /tmp holds ~500 MB; the output file lives there until uploaded. */
const MAX_VIDEO_OUTPUT_BYTES = 450 * 1024 * 1024;
/**
 * Formatted copies keep the source's own resolution (never shrunk to a 1080
 * frame). Videos stop at 4K, the most any of the platforms plays back.
 */
const MAX_VIDEO_LONG_EDGE = 3840;
const MAX_IMAGE_LONG_EDGE = 8192;
/** Peak bitrate for a 1080p copy; scales with pixel count, up to 4K. */
const VIDEO_MAXRATE_MBPS_1080P = 20;
const VIDEO_MAXRATE_MBPS_MAX = 60;
/** Never squeeze a long video below the old ceiling to fit the tmp file cap. */
const VIDEO_MAXRATE_MBPS_FLOOR = 8;
/**
 * Copies made before full-quality rendering (1080 frame, 8 Mbps cap) are
 * rebuilt when a post that hasn't started publishing asks for them.
 */
const FULL_QUALITY_SINCE = new Date("2026-09-14T10:00:00Z");

export type RenditionStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

export interface RenditionItem {
  sourceUrl: string;
  /** READY with url = the source itself when no copy was needed */
  status: RenditionStatus;
  url: string | null;
  error?: string | null;
  original?: boolean;
}

export type ResolvedMedia =
  | { status: "ready"; urls: string[] }
  | { status: "pending" }
  | { status: "failed"; error: string };

const GIF_RE = /\.gif(\?|#|$)/i;
const HEIC_RE = /\.(heic|heif)(\?|#|$)/i;

function kindOf(url: string, mimeType?: string | null): "image" | "video" | null {
  if (mimeType?.startsWith("video/") || isVideoUrl(url)) return "video";
  if (mimeType?.startsWith("image/") || isImageUrl(url)) return "image";
  return null;
}

/**
 * Make sure a rendition row exists for each source + format and report where
 * each one stands. Sources that already have the target shape pass through as
 * READY originals.
 *
 * resetFailedBefore: FAILED rows last touched before this time go back to
 * PENDING (a retried publish, or a fresh prewarm, gets a new try).
 */
export async function ensureRenditions(opts: {
  urls: string[];
  format: MediaFormat;
  clientId?: string | null;
  resetFailedBefore?: Date | null;
  /** Rebuild copies rendered at the old reduced quality (skip mid-publish, the file must not change) */
  refreshStale?: boolean;
}): Promise<RenditionItem[]> {
  const { urls, format, clientId, resetFailedBefore, refreshStale } = opts;
  if (!isPresetAspect(format.aspect)) {
    return urls.map((url) => ({ sourceUrl: url, status: "READY", url, original: true }));
  }
  const size = targetSize(format.aspect)!;

  const library = await prisma.clientMedia.findMany({
    where: { url: { in: urls } },
    select: { id: true, url: true, width: true, height: true, mimeType: true, clientId: true },
  });
  const byUrl = new Map(library.map((m) => [m.url, m]));

  const items: RenditionItem[] = [];
  for (const url of urls) {
    const media = byUrl.get(url);
    const kind = kindOf(url, media?.mimeType);

    if (!kind) {
      items.push({ sourceUrl: url, status: "FAILED", url: null, error: "Only images and videos can be reformatted." });
      continue;
    }
    // Animated GIFs would flatten to a single JPEG frame, so they always post as-is
    if (GIF_RE.test(url) || media?.mimeType === "image/gif") {
      items.push({ sourceUrl: url, status: "READY", url, original: true });
      continue;
    }
    if (media && sourceMatchesAspect(media, format.aspect)) {
      items.push({ sourceUrl: url, status: "READY", url, original: true });
      continue;
    }
    if (!isAllowedBlobUrl(url)) {
      items.push({ sourceUrl: url, status: "FAILED", url: null, error: "This file isn't in the media library, so it can't be reformatted. Upload it first." });
      continue;
    }

    const focus = focusFor(format, url);
    const key = { sourceUrl: url, aspect: format.aspect, fit: format.fit, focusX: focus.x, focusY: focus.y };

    let row: MediaRendition | null = await prisma.mediaRendition.findUnique({
      where: { sourceUrl_aspect_fit_focusX_focusY: key },
    });
    if (!row) {
      try {
        row = await prisma.mediaRendition.create({
          data: {
            ...key,
            kind,
            width: size.width,
            height: size.height,
            sourceMediaId: media?.id ?? null,
            clientId: clientId ?? media?.clientId ?? null,
          },
        });
      } catch {
        // Created by a concurrent request between our read and write
        row = await prisma.mediaRendition.findUnique({ where: { sourceUrl_aspect_fit_focusX_focusY: key } });
      }
    }
    if (!row) {
      items.push({ sourceUrl: url, status: "FAILED", url: null, error: "Couldn't queue the formatted copy." });
      continue;
    }

    if (row.status === "FAILED" && resetFailedBefore && row.updatedAt < resetFailedBefore) {
      const { count } = await prisma.mediaRendition.updateMany({
        where: { id: row.id, status: "FAILED" },
        data: { status: "PENDING", attempts: 0, error: null, lockedUntil: null },
      });
      if (count === 1) row = { ...row, status: "PENDING", attempts: 0, error: null };
    }

    if (refreshStale && row.status === "READY" && row.url && row.url !== row.sourceUrl && row.updatedAt < FULL_QUALITY_SINCE) {
      const { count } = await prisma.mediaRendition.updateMany({
        where: { id: row.id, status: "READY", updatedAt: row.updatedAt },
        data: { status: "PENDING", attempts: 0, error: null, lockedUntil: null },
      });
      if (count === 1) row = { ...row, status: "PENDING", attempts: 0, error: null };
    }

    items.push({
      sourceUrl: url,
      status: row.status as RenditionStatus,
      url: row.status === "READY" ? row.url : null,
      error: row.error,
    });
  }
  return items;
}

/** Media URLs to publish for a post: originals, or its formatted copies once they're all ready. */
export async function resolvePostMedia(
  post: Pick<ContentPost, "mediaUrls" | "platformSettings" | "clientId" | "publishStartedAt" | "publishPhase" | "publishState">
): Promise<ResolvedMedia> {
  // PDFs are LinkedIn documents, handled separately by the publisher
  const urls = post.mediaUrls.filter((u) => !/\.pdf$/i.test(u));
  const format = readMediaFormat(post.platformSettings);
  if (!format || !isPresetAspect(format.aspect) || urls.length === 0) {
    return { status: "ready", urls };
  }

  const items = await ensureRenditions({
    urls,
    format,
    clientId: post.clientId,
    resetFailedBefore: post.publishStartedAt,
    // Only before anything was sent: a resumed upload must keep reading the same file
    refreshStale: !post.publishPhase || !!(post.publishState as Record<string, unknown> | null)?.__waitingForMedia,
  });

  const failed = items.find((i) => i.status === "FAILED");
  if (failed) return { status: "failed", error: failed.error || "A formatted copy couldn't be made." };
  if (items.some((i) => i.status !== "READY" || !i.url)) return { status: "pending" };
  return { status: "ready", urls: items.map((i) => i.url!) };
}

export interface FormattedMediaView {
  sourceUrl: string;
  /** What will actually be posted when ready: the rendition, or the source itself */
  url: string;
  /** True when url is a formatted copy rather than the original file */
  formatted: boolean;
  /** Formatting is requested but the copy isn't ready (url is the original meanwhile) */
  pending: boolean;
  size: number | null;
}

/**
 * Read-only view of a post's media as it will be published, for pages that
 * show the post (manual handoff, client review). Never creates rows.
 */
export async function lookupFormattedMedia(
  post: { mediaUrls: string[]; platformSettings: unknown }
): Promise<{ format: MediaFormat | null; items: FormattedMediaView[] }> {
  const urls = post.mediaUrls.filter((u) => !/\.pdf(\?|#|$)/i.test(u));
  const format = readMediaFormat(post.platformSettings);
  const original = (url: string): FormattedMediaView => ({ sourceUrl: url, url, formatted: false, pending: false, size: null });
  if (!format || !isPresetAspect(format.aspect) || urls.length === 0) {
    return { format: null, items: urls.map(original) };
  }

  const [library, rows] = await Promise.all([
    prisma.clientMedia.findMany({
      where: { url: { in: urls } },
      select: { url: true, width: true, height: true, mimeType: true },
    }),
    prisma.mediaRendition.findMany({
      where: { sourceUrl: { in: urls }, aspect: format.aspect, fit: format.fit },
      select: { sourceUrl: true, focusX: true, focusY: true, status: true, url: true, size: true },
    }),
  ]);
  const byUrl = new Map(library.map((m) => [m.url, m]));

  const items = urls.map((url): FormattedMediaView => {
    const media = byUrl.get(url);
    if (GIF_RE.test(url) || media?.mimeType === "image/gif") return original(url);
    if (media && sourceMatchesAspect(media, format.aspect)) return original(url);
    const focus = focusFor(format, url);
    const row = rows.find((r) => r.sourceUrl === url && r.focusX === focus.x && r.focusY === focus.y);
    if (row?.status === "READY" && row.url) {
      return { sourceUrl: url, url: row.url, formatted: row.url !== url, pending: false, size: row.size };
    }
    return { sourceUrl: url, url, formatted: false, pending: true, size: null };
  });
  return { format, items };
}

// ─── Probing ───────────────────────────────────────────────────────────────

export interface ProbeResult {
  /** Upright dimensions (rotation already applied) */
  width: number;
  height: number;
  /** seconds, videos only */
  duration: number | null;
  /** First audio stream's codec (e.g. "aac"), videos only */
  audioCodec?: string | null;
}

/** Parse `ffmpeg -i` stderr for the first video stream's upright size, and the duration. */
export function parseFfmpegProbe(stderr: string): ProbeResult | null {
  const stream = stderr.match(/Stream #\d+:\d+[^\n]*?: Video: [^\n]*?(\d{2,5})x(\d{2,5})/);
  if (!stream) return null;
  let width = Number(stream[1]);
  let height = Number(stream[2]);

  // Old-style "rotate : 90" tag, or the display matrix side data
  const rotateTag = stderr.match(/rotate\s*:\s*(-?\d+)/);
  const matrix = stderr.match(/rotation of (-?[\d.]+) degrees/);
  const rotation = rotateTag ? Number(rotateTag[1]) : matrix ? Number(matrix[1]) : 0;
  if (Math.abs(Math.round(rotation)) % 180 === 90) [width, height] = [height, width];

  const d = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null;
  const audio = stderr.match(/Stream #\d+:\d+[^\n]*?: Audio: (\w+)/);
  return { width, height, duration, audioCodec: audio ? audio[1].toLowerCase() : null };
}

/** Read a video's container headers over HTTPS (no full download) for size + duration. */
export async function probeVideo(url: string, timeoutMs = 45_000): Promise<ProbeResult | null> {
  const ffmpegPath = await getFfmpegPath();
  return new Promise((resolve) => {
    // No output file: ffmpeg prints the stream info, then exits non-zero. That's expected.
    const proc = spawn(ffmpegPath, ["-hide_banner", "-nostdin", "-i", url]);
    let stderr = "";
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    proc.stderr?.on("data", (d) => {
      stderr = (stderr + d.toString()).slice(-20_000);
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.on("close", () => {
      clearTimeout(timer);
      resolve(parseFfmpegProbe(stderr));
    });
  });
}

/** Upright size of an image buffer (EXIF orientations 5 to 8 swap width and height). */
export async function probeImage(source: Buffer): Promise<ProbeResult | null> {
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(source, { failOn: "none" }).metadata();
    if (!meta.width || !meta.height) return null;
    const swap = (meta.orientation ?? 1) >= 5;
    return { width: swap ? meta.height : meta.width, height: swap ? meta.width : meta.height, duration: null };
  } catch {
    return null;
  }
}

/** Fill in ClientMedia dimensions we just learned (never overwrites existing values). */
async function rememberProbe(mediaId: string | null, probe: ProbeResult) {
  if (!mediaId) return;
  await prisma.clientMedia
    .updateMany({ where: { id: mediaId, width: null }, data: { width: probe.width, height: probe.height } })
    .catch(() => {});
  if (probe.duration != null) {
    await prisma.clientMedia
      .updateMany({ where: { id: mediaId, duration: null }, data: { duration: probe.duration } })
      .catch(() => {});
  }
}

// ─── Rendering ─────────────────────────────────────────────────────────────

export interface RenderSpec {
  width: number;
  height: number;
  fit: FitMode;
  focusX: number;
  focusY: number;
}

/**
 * Frame for a formatted copy at the source's own resolution: black bars add
 * canvas around the full picture, crop keeps the largest box that fits inside
 * it. Only shrunk when the long edge passes maxLongEdge; never upscaled.
 */
export function fullQualitySize(
  src: { width: number; height: number },
  aspect: string,
  fit: FitMode,
  maxLongEdge: number
): { width: number; height: number } | null {
  const ratio = aspectRatioValue(aspect);
  if (!ratio || !src.width || !src.height) return null;
  const wider = src.width / src.height > ratio;
  let width: number;
  let height: number;
  if (fit === "pad") {
    width = wider ? src.width : src.height * ratio;
    height = wider ? src.width / ratio : src.height;
  } else {
    width = wider ? src.height * ratio : src.width;
    height = wider ? src.height : src.width / ratio;
  }
  const scale = Math.min(1, maxLongEdge / Math.max(width, height));
  // Even dimensions for H.264
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return { width: even(width * scale), height: even(height * scale) };
}

/**
 * Crop box for filling a width×height frame from a source scaled to cover it.
 * Same math as CSS object-fit: cover + object-position: x% y%, so the
 * composer's live preview matches the rendered file.
 */
export function coverCropBox(srcW: number, srcH: number, spec: RenderSpec) {
  const scale = Math.max(spec.width / srcW, spec.height / srcH);
  const scaledW = Math.max(spec.width, Math.round(srcW * scale));
  const scaledH = Math.max(spec.height, Math.round(srcH * scale));
  return {
    scaledW,
    scaledH,
    left: Math.round((scaledW - spec.width) * spec.focusX),
    top: Math.round((scaledH - spec.height) * spec.focusY),
  };
}

/**
 * Render an image buffer into a JPEG frame. With `aspect`, the frame is sized
 * from the source (full resolution) instead of spec.width × spec.height.
 */
export async function renderImage(
  source: Buffer,
  baseSpec: RenderSpec,
  opts: { heic?: boolean; aspect?: string } = {}
): Promise<{ buffer: Buffer; width: number; height: number }> {
  let input = source;
  if (opts.heic) {
    // sharp's prebuilt libvips can't decode HEIC; decode losslessly to PNG first
    const heicConvert = (await import("heic-convert")).default;
    input = Buffer.from(await heicConvert({ buffer: source, format: "PNG" }));
  }

  const sharp = (await import("sharp")).default;
  const black = { r: 0, g: 0, b: 0, alpha: 1 };

  // Apply EXIF orientation and drop transparency before measuring
  const upright = await sharp(input, { failOn: "none" })
    .rotate()
    .flatten({ background: black })
    .toColorspace("srgb")
    .png({ compressionLevel: 0 })
    .toBuffer({ resolveWithObject: true });

  const size = opts.aspect ? fullQualitySize(upright.info, opts.aspect, baseSpec.fit, MAX_IMAGE_LONG_EDGE) : null;
  const spec: RenderSpec = size ? { ...baseSpec, ...size } : baseSpec;

  let pipeline = sharp(upright.data);
  if (spec.fit === "pad") {
    pipeline = pipeline.resize(spec.width, spec.height, { fit: "contain", background: black, kernel: "lanczos3" });
  } else {
    const box = coverCropBox(upright.info.width, upright.info.height, spec);
    pipeline = pipeline
      .resize(box.scaledW, box.scaledH, { fit: "fill", kernel: "lanczos3" })
      .extract({ left: box.left, top: box.top, width: spec.width, height: spec.height });
  }

  const buffer = await pipeline.jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer();
  return { buffer, width: spec.width, height: spec.height };
}

let cachedFfmpegPath: string | null = null;
async function getFfmpegPath(): Promise<string> {
  if (cachedFfmpegPath) return cachedFfmpegPath;
  const mod = await import("@ffmpeg-installer/ffmpeg");
  const installer = (mod as { default?: { path: string }; path?: string }).default ?? (mod as unknown as { path: string });
  cachedFfmpegPath = installer.path;
  return cachedFfmpegPath;
}

/** The ffmpeg -vf chain for a spec. Rotation metadata is applied by ffmpeg's autorotate before this runs. */
export function videoFilter(spec: RenderSpec): string {
  const { width: W, height: H } = spec;
  if (spec.fit === "pad") {
    return [
      `scale=${W}:${H}:force_original_aspect_ratio=decrease`,
      `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black`,
      "setsar=1",
    ].join(",");
  }
  // Cover-scale, then crop at the focus point: x = (iw - ow) * focusX, same as CSS object-position
  return [
    `scale=${W}:${H}:force_original_aspect_ratio=increase`,
    `crop=${W}:${H}:(iw-${W})*${spec.focusX}:(ih-${H})*${spec.focusY}`,
    "setsar=1",
  ].join(",");
}

/**
 * Render a video (read straight from its URL, no full download) into an H.264
 * MP4 file in tmp. Resolves with the file path; rejects on failure or when the
 * deadline passes (ffmpeg is killed, the caller leaves the row retryable).
 */
/**
 * Peak bitrate for a copy: 20 Mbps at 1080p, scaled by pixel count up to
 * 60 Mbps, lowered (never under the old 8 Mbps) only when a long clip would
 * otherwise outgrow the tmp file cap.
 */
export function videoMaxrateMbps(spec: { width: number; height: number }, durationSec: number | null | undefined): number {
  const pixels = (spec.width * spec.height) / (1920 * 1080);
  let rate = Math.min(VIDEO_MAXRATE_MBPS_MAX, Math.max(VIDEO_MAXRATE_MBPS_1080P, Math.round(VIDEO_MAXRATE_MBPS_1080P * pixels)));
  if (durationSec && durationSec > 0) {
    const fitsCap = Math.floor((MAX_VIDEO_OUTPUT_BYTES * 0.85 * 8) / (durationSec * 1_000_000)) - 1;
    rate = Math.min(rate, Math.max(VIDEO_MAXRATE_MBPS_FLOOR, fitsCap));
  }
  return rate;
}

export async function renderVideo(
  inputUrl: string,
  spec: RenderSpec,
  deadline: number,
  workDir: string,
  source: { duration?: number | null; audioCodec?: string | null } = {}
): Promise<string> {
  const ffmpegPath = await getFfmpegPath();
  const outputPath = join(workDir, "out.mp4");
  const maxrate = videoMaxrateMbps(spec, source.duration);
  // AAC audio is copied bit for bit; anything else (PCM, Opus...) becomes high-bitrate AAC for MP4
  const audio = source.audioCodec === "aac" ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "320k"];
  const args = [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-i", inputUrl,
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-vf", videoFilter(spec),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-profile:v", "high",
    "-crf", "16",
    "-maxrate", `${maxrate}M`,
    "-bufsize", `${maxrate * 2}M`,
    "-pix_fmt", "yuv420p",
    ...audio,
    "-movflags", "+faststart",
    "-fs", String(MAX_VIDEO_OUTPUT_BYTES),
    outputPath,
  ];

  const timeLeft = deadline - Date.now();
  if (timeLeft < 30_000) throw new RenderTimeout();

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeLeft);

    proc.stderr?.on("data", (d) => {
      stderr = (stderr + d.toString()).slice(-4000);
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new RenderTimeout());
      if (code !== 0) {
        const line = stderr.trim().split("\n").slice(-3).join(" ").slice(0, 400);
        return reject(new Error(`ffmpeg exited with ${code}: ${line}`));
      }
      resolve();
    });
  });

  const { size } = await stat(outputPath);
  if (size < 1024) throw new Error("The formatted video came out empty.");
  if (size >= MAX_VIDEO_OUTPUT_BYTES - 1024 * 1024) {
    throw new PermanentRenderError(
      "This video is too long to reformat on the server (about 7 minutes max). Upload a version already in the right shape."
    );
  }
  return outputPath;
}

/** pixelScale: output pixels relative to 1080p (a 4K copy takes about 4× the work) */
function estimateVideoWorkMs(durationSec: number | null | undefined, pixelScale = 1): number {
  if (durationSec == null) return MIN_VIDEO_BUDGET_MS;
  return Math.max(MIN_VIDEO_BUDGET_MS, durationSec * VIDEO_SECONDS_PER_SECOND * Math.max(1, pixelScale) * 1000 + VIDEO_FIXED_OVERHEAD_MS);
}

class RenderTimeout extends Error {
  constructor() {
    super("Formatting ran out of time for this run.");
  }
}

/** A failure that retrying can't fix. */
class PermanentRenderError extends Error {}

/** Long edges tried for a video copy, largest first, until the encode fits the run. */
const VIDEO_LONG_EDGE_STEPS = [MAX_VIDEO_LONG_EDGE, 2560, 1920];

async function renderRow(
  row: MediaRendition,
  deadline: number
): Promise<{ url: string; size: number | null; width?: number; height?: number }> {
  const spec: RenderSpec = { width: row.width, height: row.height, fit: row.fit as FitMode, focusX: row.focusX, focusY: row.focusY };
  const matchesTarget = (probe: ProbeResult | null) => !!probe && sourceMatchesAspect(probe, row.aspect);

  if (GIF_RE.test(row.sourceUrl)) {
    // Never flatten an animation into a still
    return { url: row.sourceUrl, size: null };
  }

  if (row.kind === "image") {
    const source = await fetchBlobBounded(row.sourceUrl, MAX_IMAGE_SOURCE_BYTES);
    const heic = HEIC_RE.test(row.sourceUrl);
    // HEIC still converts (platforms want JPEG); anything else already in the
    // right shape posts as the untouched original
    if (!heic) {
      const probe = await probeImage(source);
      if (probe) await rememberProbe(row.sourceMediaId, probe);
      if (matchesTarget(probe)) return { url: row.sourceUrl, size: source.length };
    }
    const jpeg = await renderImage(source, spec, { heic, aspect: row.aspect });
    const blob = await put(`social/renditions/${row.id}.jpg`, jpeg.buffer, {
      access: "public",
      addRandomSuffix: true,
      contentType: "image/jpeg",
    });
    return { url: blob.url, size: jpeg.buffer.length, width: jpeg.width, height: jpeg.height };
  }

  // Read the headers first: a video already in the target shape is posted as
  // the original, at full quality, instead of being re-encoded
  const probe = await probeVideo(row.sourceUrl);
  if (probe) await rememberProbe(row.sourceMediaId, probe);
  if (matchesTarget(probe)) return { url: row.sourceUrl, size: null };

  // Keep the source's resolution; step down only if the encode can't finish in a run
  let videoSpec = spec;
  if (probe) {
    const runMs = deadline - 60_000 - Date.now();
    for (const longEdge of VIDEO_LONG_EDGE_STEPS) {
      const size = fullQualitySize(probe, row.aspect, spec.fit, longEdge);
      if (!size) break;
      videoSpec = { ...spec, ...size };
      const pixelScale = (size.width * size.height) / (1920 * 1080);
      if (probe.duration == null || estimateVideoWorkMs(probe.duration, pixelScale) <= runMs) break;
    }
  }
  const pixelScale = (videoSpec.width * videoSpec.height) / (1920 * 1080);
  if (probe?.duration != null && Date.now() + estimateVideoWorkMs(probe.duration, pixelScale) > deadline) {
    // Not enough of this run left; hand it back untouched for a fresh run
    throw new RenderTimeout();
  }

  const workDir = join(tmpdir(), `rendition-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  try {
    // Leave time to upload the result before the function is cut off
    const outputPath = await renderVideo(row.sourceUrl, videoSpec, deadline - 60_000, workDir, {
      duration: probe?.duration,
      audioCodec: probe?.audioCodec,
    });
    const { size } = await stat(outputPath);
    const blob = await put(`social/renditions/${row.id}.mp4`, createReadStream(outputPath), {
      access: "public",
      addRandomSuffix: true,
      contentType: "video/mp4",
      multipart: true,
    });
    return { url: blob.url, size, width: videoSpec.width, height: videoSpec.height };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Worker for the render cron. Leases one row at a time so overlapping cron
 * runs never render the same file twice.
 */
export async function renderPendingRenditions(opts: { budgetMs?: number } = {}): Promise<{
  rendered: number;
  failed: number;
  retrying: number;
}> {
  const { budgetMs = 700_000 } = opts;
  const startedAt = Date.now();
  const deadline = startedAt + budgetMs;
  const result = { rendered: 0, failed: 0, retrying: 0 };

  // Rows whose last allowed attempt was cut off mid-render (function killed)
  // would otherwise sit in PROCESSING forever and hold their posts hostage
  const abandoned = await prisma.mediaRendition.updateMany({
    where: { status: "PROCESSING", lockedUntil: { lt: new Date() }, attempts: { gte: MAX_ATTEMPTS } },
    data: {
      status: "FAILED",
      lockedUntil: null,
      error: "Formatting kept getting cut off before it finished. Upload a shorter clip or one already in the right shape, then retry.",
    },
  });
  result.failed += abandoned.count;

  const skipped = new Set<string>();

  while (deadline - Date.now() > 90_000) {
    const now = new Date();
    const candidates = await prisma.mediaRendition.findMany({
      where: {
        id: { notIn: [...skipped] },
        attempts: { lt: MAX_ATTEMPTS },
        OR: [
          { status: "PENDING", OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
          { status: "PROCESSING", lockedUntil: { lt: now } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    });
    if (candidates.length === 0) break;

    // Don't start a video this run can't finish: it would just time out and
    // burn an attempt. Images are quick and always fit.
    const remaining = deadline - Date.now();
    const durations = new Map(
      (
        await prisma.clientMedia.findMany({
          where: { id: { in: candidates.map((c) => c.sourceMediaId).filter((x): x is string => !!x) } },
          select: { id: true, duration: true },
        })
      ).map((m) => [m.id, m.duration])
    );
    const candidate = candidates.find(
      (c) =>
        c.kind !== "video" ||
        remaining > estimateVideoWorkMs(c.sourceMediaId ? durations.get(c.sourceMediaId) : null)
    );
    if (!candidate) break;

    const lease = await prisma.mediaRendition.updateMany({
      where: { id: candidate.id, status: candidate.status, lockedUntil: candidate.lockedUntil },
      data: {
        status: "PROCESSING",
        lockedUntil: new Date(deadline + 60_000),
        attempts: { increment: 1 },
      },
    });
    if (lease.count !== 1) {
      skipped.add(candidate.id);
      continue;
    }
    const attempts = candidate.attempts + 1;
    const leasedWithMs = deadline - Date.now();

    try {
      const { url, size, width, height } = await renderRow(candidate, deadline);
      await prisma.mediaRendition.update({
        where: { id: candidate.id },
        data: { status: "READY", url, size, error: null, lockedUntil: null, ...(width && height ? { width, height } : {}) },
      });
      result.rendered++;
    } catch (err) {
      // Cut off by this run's own budget after starting late: not the file's
      // fault. Give the attempt back and let a fresh run take it.
      if (err instanceof RenderTimeout && leasedWithMs < budgetMs * 0.8) {
        await prisma.mediaRendition.update({
          where: { id: candidate.id },
          data: { status: "PENDING", lockedUntil: null, attempts: { decrement: 1 } },
        });
        skipped.add(candidate.id);
        result.retrying++;
        continue;
      }

      const permanent = err instanceof PermanentRenderError;
      const message =
        err instanceof RenderTimeout
          ? "Formatting this video takes longer than the server allows. Upload a shorter clip or one already in the right shape."
          : (err as Error).message || "Formatting failed.";
      const giveUp = permanent || attempts >= MAX_ATTEMPTS;
      await prisma.mediaRendition.update({
        where: { id: candidate.id },
        data: {
          status: giveUp ? "FAILED" : "PENDING",
          error: message.slice(0, 1000),
          // Wait a minute before the next try so a fresh run has its full budget
          lockedUntil: giveUp ? null : new Date(Date.now() + 60_000),
          ...(permanent ? { attempts: MAX_ATTEMPTS } : {}),
        },
      });
      if (giveUp) result.failed++;
      else result.retrying++;
      skipped.add(candidate.id);
      console.error(`[render-media] ${candidate.id} ${giveUp ? "failed" : "will retry"}:`, message);
    }
  }

  return result;
}
