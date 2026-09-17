/**
 * Photos + one audio track rendered into a single 9:16 MP4.
 *
 * Instagram (and Facebook) can't attach audio to a carousel through the API,
 * so "a carousel with audio" is posted as a Reel: every photo becomes a slide
 * in one video with the track laid over it. The result is an ordinary video
 * in the client's library, so the publisher needs no special handling.
 */

import { spawn } from "child_process";
import { createReadStream } from "fs";
import { mkdir, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { put } from "@vercel/blob";
import { fetchBlobBounded, isAllowedBlobUrl } from "@/lib/blob-fetch";
import { getFfmpegPath, renderImage } from "@/lib/social/renditions";
import type { FitMode } from "@/lib/social/formats";

export const SLIDESHOW_MAX_SLIDES = 20;
export const SLIDESHOW_MAX_SECONDS = 180;
const SLIDE_MIN_SECONDS = 1.5;
const SLIDE_MAX_SECONDS = 10;
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const FADE_OUT_SECONDS = 0.6;
const MAX_IMAGE_BYTES = 100 * 1024 * 1024;
const MAX_AUDIO_BYTES = 150 * 1024 * 1024;
const HEIC_RE = /\.(heic|heif)(\?|#|$)/i;

export class SlideshowError extends Error {}

export interface SlideshowOptions {
  imageUrls: string[];
  audioUrl: string;
  /** Seconds each photo stays up, or "match" to spread the photos across the whole track */
  secondsPerSlide: number | "match";
  fit: FitMode;
  /** Where in the track to start, in seconds */
  audioStart?: number;
  /** Stop ffmpeg after this many ms */
  timeoutMs?: number;
}

export interface SlideshowResult {
  url: string;
  size: number;
  width: number;
  height: number;
  duration: number;
  thumbnailUrl: string | null;
}

function runFfmpeg(ffmpegPath: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeoutMs);
    proc.stderr?.on("data", (d) => {
      stderr = (stderr + d.toString()).slice(-20_000);
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new SlideshowError("Making the video took too long. Try fewer photos or a shorter slide length."));
      resolve({ code, stderr });
    });
  });
}

/** Seconds of audio in a local file, read from `ffmpeg -i` (no output file, so a non-zero exit is expected). */
async function audioDuration(ffmpegPath: string, path: string): Promise<number | null> {
  const { stderr } = await runFfmpeg(ffmpegPath, ["-hide_banner", "-nostdin", "-i", path], 30_000);
  if (!/Stream #\d+:\d+[^\n]*?: Audio:/.test(stderr)) throw new SlideshowError("That file has no audio in it.");
  const d = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  return d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null;
}

/** How long each slide shows, and the video's total length. */
export function slideTiming(
  slides: number,
  secondsPerSlide: number | "match",
  audioSeconds: number | null,
  audioStart: number
): { perSlide: number; total: number } {
  const clamp = (n: number) => Math.min(SLIDE_MAX_SECONDS, Math.max(SLIDE_MIN_SECONDS, n));
  let perSlide: number;
  if (secondsPerSlide === "match") {
    const usable = audioSeconds != null ? Math.max(0, audioSeconds - audioStart) : 0;
    perSlide = clamp(usable > 0 ? usable / slides : 3);
  } else {
    perSlide = clamp(Number(secondsPerSlide) || 3);
  }
  perSlide = Math.min(perSlide, SLIDESHOW_MAX_SECONDS / slides);
  // Reels must run at least 3 seconds
  if (perSlide * slides < 3) perSlide = 3 / slides;
  perSlide = Math.round(perSlide * 100) / 100;
  return { perSlide, total: Math.round(perSlide * slides * 100) / 100 };
}

/**
 * The ffmpeg half: local audio file + photo buffers in, MP4 path out (inside
 * workDir). Split from the Blob fetch/upload so it can be run on its own.
 */
export async function encodeSlideshow(opts: {
  workDir: string;
  photos: { buffer: Buffer; heic?: boolean }[];
  audioPath: string;
  secondsPerSlide: number | "match";
  fit: FitMode;
  audioStart?: number;
  timeoutMs: number;
}): Promise<{ outputPath: string; duration: number; firstSlide: Buffer }> {
  const { workDir, photos, audioPath, secondsPerSlide, fit, timeoutMs } = opts;
  const startedAt = Date.now();
  const ffmpegPath = await getFfmpegPath();

  const audioSeconds = await audioDuration(ffmpegPath, audioPath);
  let audioStart = Math.max(0, Number(opts.audioStart) || 0);
  if (audioSeconds != null && audioStart >= audioSeconds - 1) audioStart = 0;
  const { perSlide, total } = slideTiming(photos.length, secondsPerSlide, audioSeconds, audioStart);

  const slidePaths: string[] = [];
  let firstSlide: Buffer | null = null;
  for (let i = 0; i < photos.length; i++) {
    const frame = await renderImage(
      photos[i].buffer,
      { width: WIDTH, height: HEIGHT, fit, focusX: 0.5, focusY: 0.5 },
      { heic: photos[i].heic }
    ).catch(() => {
      throw new SlideshowError(`Photo ${i + 1} couldn't be read. Only photos can go into a Reel made this way.`);
    });
    const path = join(workDir, `slide-${i}.jpg`);
    await writeFile(path, frame.buffer);
    slidePaths.push(path);
    if (i === 0) firstSlide = frame.buffer;
    // Let the original go before the next one loads: keeps memory flat
    photos[i] = { buffer: Buffer.alloc(0) };
  }

  const outputPath = join(workDir, "reel.mp4");
  const inputs = slidePaths.flatMap((path) => ["-loop", "1", "-framerate", String(FPS), "-t", String(perSlide), "-i", path]);
  const audioIndex = slidePaths.length;
  const fadeStart = Math.max(0, total - FADE_OUT_SECONDS);
  const filter = [
    `${slidePaths.map((_, i) => `[${i}:v]`).join("")}concat=n=${slidePaths.length}:v=1:a=0,format=yuv420p[v]`,
    `[${audioIndex}:a]afade=t=out:st=${fadeStart}:d=${FADE_OUT_SECONDS}[a]`,
  ].join(";");

  const args = [
    "-hide_banner",
    "-nostdin",
    "-y",
    ...inputs,
    // A track shorter than the video starts over instead of going silent
    "-ss", String(audioStart),
    "-stream_loop", "-1",
    "-i", audioPath,
    "-filter_complex", filter,
    "-map", "[v]",
    "-map", "[a]",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-profile:v", "high",
    "-crf", "18",
    "-r", String(FPS),
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "256k",
    "-ar", "48000",
    "-t", String(total),
    "-movflags", "+faststart",
    outputPath,
  ];

  const timeLeft = timeoutMs - (Date.now() - startedAt);
  const { code, stderr } = await runFfmpeg(ffmpegPath, args, Math.max(30_000, timeLeft));
  if (code !== 0) {
    const line = stderr.trim().split("\n").slice(-3).join(" ").slice(0, 400);
    throw new Error(`ffmpeg exited with ${code}: ${line}`);
  }
  const { size } = await stat(outputPath);
  if (size < 1024) throw new Error("The video came out empty.");
  return { outputPath, duration: total, firstSlide: firstSlide! };
}

export async function renderSlideshow(opts: SlideshowOptions): Promise<SlideshowResult> {
  const { imageUrls, audioUrl, secondsPerSlide, fit } = opts;
  const timeoutMs = opts.timeoutMs ?? 600_000;
  const startedAt = Date.now();

  if (imageUrls.length === 0) throw new SlideshowError("Add at least one photo.");
  if (imageUrls.length > SLIDESHOW_MAX_SLIDES) throw new SlideshowError(`A Reel from photos can hold up to ${SLIDESHOW_MAX_SLIDES} photos.`);
  if (![...imageUrls, audioUrl].every(isAllowedBlobUrl)) {
    throw new SlideshowError("Every file has to be in the media library first. Upload it, then try again.");
  }

  const workDir = join(tmpdir(), `slideshow-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  try {
    const audioExt = (audioUrl.split(/[?#]/)[0].match(/\.(\w{2,5})$/)?.[1] || "mp3").toLowerCase();
    const audioPath = join(workDir, `audio.${audioExt}`);
    await writeFile(audioPath, await fetchBlobBounded(audioUrl, MAX_AUDIO_BYTES));

    const photos: { buffer: Buffer; heic?: boolean }[] = [];
    for (const url of imageUrls) {
      photos.push({ buffer: await fetchBlobBounded(url, MAX_IMAGE_BYTES), heic: HEIC_RE.test(url) });
    }

    const { outputPath, duration, firstSlide } = await encodeSlideshow({
      workDir,
      photos,
      audioPath,
      secondsPerSlide,
      fit,
      audioStart: opts.audioStart,
      timeoutMs: timeoutMs - (Date.now() - startedAt),
    });
    const { size } = await stat(outputPath);

    const id = randomUUID();
    const blob = await put(`media/reels/${id}.mp4`, createReadStream(outputPath), {
      access: "public",
      contentType: "video/mp4",
      multipart: size > 8 * 1024 * 1024,
    });

    let thumbnailUrl: string | null = null;
    try {
      const sharp = (await import("sharp")).default;
      const thumb = await sharp(firstSlide).resize({ width: 540 }).jpeg({ quality: 80 }).toBuffer();
      thumbnailUrl = (await put(`media/reels/${id}-thumb.jpg`, thumb, { access: "public", contentType: "image/jpeg" })).url;
    } catch {
      /* the library shows a film icon instead */
    }

    return { url: blob.url, size, width: WIDTH, height: HEIGHT, duration, thumbnailUrl };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
