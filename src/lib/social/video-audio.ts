/**
 * One video + one audio track in, a new MP4 out with the track on it.
 *
 * The picture is copied bit for bit (no re-encode, so no quality loss and it
 * runs in seconds); only the sound is rebuilt. The track either replaces the
 * video's own sound or plays under it.
 */

import { createReadStream } from "fs";
import { mkdir, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { put } from "@vercel/blob";
import { fetchBlobBounded, isAllowedBlobUrl } from "@/lib/blob-fetch";
import { getFfmpegPath, parseFfmpegProbe } from "@/lib/social/renditions";
import { runFfmpeg } from "@/lib/social/slideshow";

const MAX_AUDIO_BYTES = 150 * 1024 * 1024;
// The finished file is about the size of the source and has to fit in the function's temp disk
export const VIDEO_AUDIO_MAX_BYTES = 400 * 1024 * 1024;
const FADE_OUT_SECONDS = 0.6;

export class VideoAudioError extends Error {}

export interface VideoAudioOptions {
  videoUrl: string;
  audioUrl: string;
  /** Keep the video's own sound under the track */
  keepOriginal: boolean;
  /** 0 to 1 */
  trackVolume?: number;
  /** 0 to 1, only with keepOriginal */
  originalVolume?: number;
  /** Where in the track to start, in seconds */
  audioStart?: number;
  timeoutMs?: number;
}

export interface VideoAudioResult {
  url: string;
  size: number;
  width: number;
  height: number;
  duration: number | null;
}

const clamp01 = (n: unknown, fallback: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
};

/** The audio filter graph. Exported so it can be checked without running ffmpeg. */
export function audioFilter(opts: { mix: boolean; trackVolume: number; originalVolume: number; duration: number | null }): string {
  const fade = opts.duration && opts.duration > FADE_OUT_SECONDS * 2 ? `,afade=t=out:st=${(opts.duration - FADE_OUT_SECONDS).toFixed(2)}:d=${FADE_OUT_SECONDS}` : "";
  if (!opts.mix) return `[1:a]volume=${opts.trackVolume}${fade}[a]`;
  // amix halves each input, so bring the sum back up afterwards
  return `[0:a:0]volume=${opts.originalVolume}[va];[1:a]volume=${opts.trackVolume}${fade}[ma];[va][ma]amix=inputs=2:duration=first:dropout_transition=0,volume=2[a]`;
}

export async function renderVideoWithAudio(opts: VideoAudioOptions): Promise<VideoAudioResult> {
  const { videoUrl, audioUrl } = opts;
  const timeoutMs = opts.timeoutMs ?? 600_000;
  const startedAt = Date.now();

  if (!isAllowedBlobUrl(videoUrl) || !isAllowedBlobUrl(audioUrl)) {
    throw new VideoAudioError("Both files have to be uploaded here first.");
  }

  const head = await fetch(videoUrl, { method: "HEAD", redirect: "manual" }).catch(() => null);
  const videoBytes = Number(head?.headers.get("content-length")) || 0;
  if (videoBytes > VIDEO_AUDIO_MAX_BYTES) {
    throw new VideoAudioError("This video is too big to add audio to here (400 MB max). Add the audio in your editor and upload the finished video.");
  }

  const ffmpegPath = await getFfmpegPath();
  const workDir = join(tmpdir(), `video-audio-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  try {
    const probe = await runFfmpeg(ffmpegPath, ["-hide_banner", "-nostdin", "-i", videoUrl], 45_000);
    const info = parseFfmpegProbe(probe.stderr);
    if (!info) throw new VideoAudioError("That file couldn't be read as a video.");
    const isHevc = /Stream #\d+:\d+[^\n]*?: Video: hevc/i.test(probe.stderr);

    const audioExt = (audioUrl.split(/[?#]/)[0].match(/\.(\w{2,5})$/)?.[1] || "mp3").toLowerCase();
    const audioPath = join(workDir, `audio.${audioExt}`);
    await writeFile(audioPath, await fetchBlobBounded(audioUrl, MAX_AUDIO_BYTES));

    const audioProbe = await runFfmpeg(ffmpegPath, ["-hide_banner", "-nostdin", "-i", audioPath], 30_000);
    if (!/Stream #\d+:\d+[^\n]*?: Audio:/.test(audioProbe.stderr)) throw new VideoAudioError("That file has no audio in it.");
    const ad = audioProbe.stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
    const audioSeconds = ad ? Number(ad[1]) * 3600 + Number(ad[2]) * 60 + Number(ad[3]) : null;
    let audioStart = Math.max(0, Number(opts.audioStart) || 0);
    if (audioSeconds != null && audioStart >= audioSeconds - 1) audioStart = 0;

    const mix = opts.keepOriginal && !!info.audioCodec;
    const filter = audioFilter({
      mix,
      trackVolume: clamp01(opts.trackVolume, mix ? 0.6 : 1),
      originalVolume: clamp01(opts.originalVolume, 1),
      duration: info.duration,
    });

    const outputPath = join(workDir, "out.mp4");
    const args = [
      "-hide_banner",
      "-nostdin",
      "-y",
      "-i", videoUrl,
      // A track shorter than the video starts over instead of going silent
      "-ss", String(audioStart),
      "-stream_loop", "-1",
      "-i", audioPath,
      "-filter_complex", filter,
      "-map", "0:v:0",
      "-map", "[a]",
      "-c:v", "copy",
      ...(isHevc ? ["-tag:v", "hvc1"] : []),
      "-c:a", "aac",
      "-b:a", "256k",
      "-ar", "48000",
      ...(info.duration ? ["-t", String(info.duration)] : ["-shortest"]),
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

    const blob = await put(`media/with-audio/${randomUUID()}.mp4`, createReadStream(outputPath), {
      access: "public",
      contentType: "video/mp4",
      multipart: size > 8 * 1024 * 1024,
    });

    return { url: blob.url, size, width: info.width, height: info.height, duration: info.duration };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
