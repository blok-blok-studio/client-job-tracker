import { spawn } from "child_process";
import { writeFile, unlink, mkdir, readFile, rmdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { put } from "@vercel/blob";
import prisma from "@/lib/prisma";

// Resolve the bundled ffmpeg binary path lazily — @ffmpeg-installer/ffmpeg's
// platform-binary lookup runs at module-load time and would fail during Next's
// build-time page-data collection if the linux-x64 sub-package isn't yet
// installed. Loading on first call defers it to runtime on the deployed function.
let cachedFfmpegPath: string | null = null;
async function getFfmpegPath(): Promise<string> {
  if (cachedFfmpegPath) return cachedFfmpegPath;
  const mod = await import("@ffmpeg-installer/ffmpeg");
  // CommonJS interop: the package's `module.exports = { path, ... }` may surface
  // either as the default export (with esModuleInterop) or as the namespace itself.
  const installer = (mod as { default?: { path: string }; path?: string }).default
    ?? (mod as unknown as { path: string });
  cachedFfmpegPath = installer.path;
  return cachedFfmpegPath;
}

// QuickTime/.mov files often store the moov atom (metadata index) at the END
// of the file, so a 10MB head-only download isn't enough for ffmpeg to decode
// — that's the most common cause of "ffmpeg failed" on iPhone HEVC uploads.
// Cap the full-download retry at 500MB to avoid OOM on huge files.
const MAX_FULL_DOWNLOAD_BYTES = 500 * 1024 * 1024;

async function runFfmpeg(inputPath: string, outputPath: string, mediaId: string): Promise<{ ok: boolean; stderr: string }> {
  const ffmpegPath = await getFfmpegPath();
  return new Promise((resolve) => {
    const proc = spawn(
      ffmpegPath,
      [
        "-i", inputPath,
        "-ss", "0.5",
        "-vframes", "1",
        "-q:v", "4",
        "-vf", "scale=640:-1",
        "-y",
        outputPath,
      ],
      { timeout: 60000 }
    );

    let stderr = "";
    proc.stderr?.on("data", (d) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      if (code !== 0) {
        console.error(`[Thumbnail] ffmpeg exit ${code} for ${mediaId}:`, stderr.slice(-500));
      }
      resolve({ ok: code === 0, stderr });
    });

    proc.on("error", (err) => {
      console.error(`[Thumbnail] ffmpeg spawn error for ${mediaId}:`, err);
      resolve({ ok: false, stderr: String(err) });
    });
  });
}

/**
 * Download a video URL and extract a JPEG frame at 0.5s via the bundled ffmpeg.
 * Tries a 10MB head-only fetch first (fast for most files); on ffmpeg failure,
 * retries with a full download up to MAX_FULL_DOWNLOAD_BYTES — needed for
 * iPhone HEVC .mov files where the moov atom sits at the end of the file.
 */
export async function generateVideoThumbnail(
  videoUrl: string,
  mediaId: string
): Promise<string | null> {
  const workDir = join(tmpdir(), `thumb-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  const inputPath = join(workDir, "input.mp4");
  const outputPath = join(workDir, "thumb.jpg");

  try {
    const headRes = await fetch(videoUrl, { headers: { Range: "bytes=0-10485759" } });
    if (!headRes.ok && headRes.status !== 206) {
      console.error(`[Thumbnail] head fetch failed for ${mediaId}: ${headRes.status}`);
      return null;
    }
    await writeFile(inputPath, Buffer.from(await headRes.arrayBuffer()));

    let result = await runFfmpeg(inputPath, outputPath, mediaId);

    if (!result.ok) {
      // Fall back to full download — the moov atom is likely at the file's end
      const fullRes = await fetch(videoUrl);
      if (!fullRes.ok) {
        console.error(`[Thumbnail] full fetch failed for ${mediaId}: ${fullRes.status}`);
        return null;
      }
      const contentLength = Number(fullRes.headers.get("content-length") || "0");
      if (contentLength > MAX_FULL_DOWNLOAD_BYTES) {
        console.error(`[Thumbnail] file too large for ${mediaId}: ${contentLength}`);
        return null;
      }
      const buf = Buffer.from(await fullRes.arrayBuffer());
      if (buf.length > MAX_FULL_DOWNLOAD_BYTES) {
        console.error(`[Thumbnail] body too large for ${mediaId}: ${buf.length}`);
        return null;
      }
      await writeFile(inputPath, buf);
      result = await runFfmpeg(inputPath, outputPath, mediaId);
      if (!result.ok) return null;
    }

    const thumbBuffer = await readFile(outputPath);
    if (thumbBuffer.length < 100) return null;

    const blob = await put(`thumbnails/${mediaId}.jpg`, thumbBuffer, {
      access: "public",
      allowOverwrite: true,
      contentType: "image/jpeg",
    });

    return blob.url;
  } catch (err) {
    console.error(`[Thumbnail] generation error for ${mediaId}:`, err);
    return null;
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
    await rmdir(workDir).catch(() => {});
  }
}

/**
 * Process a batch of videos that lack thumbnails. Returns counts.
 * Used by both the cron job and the manual generate-thumbnails endpoint.
 */
export async function backfillMissingThumbnails(limit = 10): Promise<{
  generated: number;
  total: number;
}> {
  const videos = await prisma.clientMedia.findMany({
    where: { fileType: "VIDEO", thumbnailUrl: null },
    select: { id: true, url: true },
    take: limit,
  });

  if (videos.length === 0) return { generated: 0, total: 0 };

  let generated = 0;
  for (const video of videos) {
    const thumbUrl = await generateVideoThumbnail(video.url, video.id).catch(() => null);
    if (thumbUrl) {
      await prisma.clientMedia
        .update({ where: { id: video.id }, data: { thumbnailUrl: thumbUrl } })
        .catch(() => {});
      generated++;
    }
  }

  return { generated, total: videos.length };
}

/**
 * Transcode a video to a web-safe H.264 + AAC MP4 with faststart so any
 * browser can play it. Originals are never modified — the new file is
 * uploaded to `playback/{mediaId}.mp4` and the URL is returned.
 *
 * This is the fix for HEVC .mov files (iPhone) which Chrome/Firefox can't
 * decode natively. Returns null on failure (callers should fall back to the
 * original URL).
 */
export async function transcodeToWebMp4(
  videoUrl: string,
  mediaId: string
): Promise<string | null> {
  const workDir = join(tmpdir(), `xcode-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  const inputPath = join(workDir, "input");
  const outputPath = join(workDir, "out.mp4");

  try {
    const fullRes = await fetch(videoUrl);
    if (!fullRes.ok) {
      console.error(`[Transcode] fetch failed for ${mediaId}: ${fullRes.status}`);
      return null;
    }
    const contentLength = Number(fullRes.headers.get("content-length") || "0");
    if (contentLength > MAX_FULL_DOWNLOAD_BYTES) {
      console.error(`[Transcode] file too large for ${mediaId}: ${contentLength}`);
      return null;
    }
    const buf = Buffer.from(await fullRes.arrayBuffer());
    if (buf.length > MAX_FULL_DOWNLOAD_BYTES) {
      console.error(`[Transcode] body too large for ${mediaId}: ${buf.length}`);
      return null;
    }
    await writeFile(inputPath, buf);

    const ffmpegPath = await getFfmpegPath();
    const result = await new Promise<{ ok: boolean; stderr: string }>((resolve) => {
      const proc = spawn(
        ffmpegPath,
        [
          "-i", inputPath,
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-crf", "23",
          "-pix_fmt", "yuv420p",
          "-vf", "scale='min(1920,iw)':-2",
          "-c:a", "aac",
          "-b:a", "128k",
          "-movflags", "+faststart",
          "-y",
          outputPath,
        ],
        { timeout: 280000 }
      );

      let stderr = "";
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });

      proc.on("close", (code) => {
        if (code !== 0) {
          console.error(`[Transcode] ffmpeg exit ${code} for ${mediaId}:`, stderr.slice(-500));
        }
        resolve({ ok: code === 0, stderr });
      });

      proc.on("error", (err) => {
        console.error(`[Transcode] ffmpeg spawn error for ${mediaId}:`, err);
        resolve({ ok: false, stderr: String(err) });
      });
    });

    if (!result.ok) return null;

    const outBuffer = await readFile(outputPath);
    if (outBuffer.length < 1024) return null;

    const blob = await put(`playback/${mediaId}.mp4`, outBuffer, {
      access: "public",
      allowOverwrite: true,
      contentType: "video/mp4",
    });

    return blob.url;
  } catch (err) {
    console.error(`[Transcode] error for ${mediaId}:`, err);
    return null;
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
    await rmdir(workDir).catch(() => {});
  }
}

/**
 * Process a batch of videos that lack a web-safe playback URL.
 * Skips files that are already video/mp4 (those almost always have an h264
 * stream and play fine in browsers).
 */
export async function backfillMissingPlayback(limit = 3): Promise<{
  generated: number;
  total: number;
}> {
  const videos = await prisma.clientMedia.findMany({
    where: {
      fileType: "VIDEO",
      playbackUrl: null,
      mimeType: { not: "video/mp4" },
    },
    select: { id: true, url: true },
    take: limit,
  });

  if (videos.length === 0) return { generated: 0, total: 0 };

  let generated = 0;
  for (const video of videos) {
    const playbackUrl = await transcodeToWebMp4(video.url, video.id).catch(() => null);
    if (playbackUrl) {
      await prisma.clientMedia
        .update({ where: { id: video.id }, data: { playbackUrl } })
        .catch(() => {});
      generated++;
    }
  }

  return { generated, total: videos.length };
}
