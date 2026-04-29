import { spawn } from "child_process";
import { writeFile, unlink, mkdir, readFile, rmdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { put } from "@vercel/blob";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import prisma from "@/lib/prisma";

const FFMPEG_PATH = ffmpegInstaller.path;

/**
 * Download the first ~10MB of a video URL, run ffmpeg to extract a JPEG frame
 * at 0.5s, upload the JPEG to Vercel Blob, and return its public URL.
 *
 * Uses the bundled ffmpeg binary from @ffmpeg-installer/ffmpeg so it works in
 * Vercel serverless functions (system ffmpeg is not available there).
 *
 * Returns null on any failure — callers should treat thumbnail generation as
 * best-effort and continue without one.
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
    const res = await fetch(videoUrl, {
      headers: { Range: "bytes=0-10485759" },
    });
    if (!res.ok && res.status !== 206) {
      const fullRes = await fetch(videoUrl);
      if (!fullRes.ok) return null;
      await writeFile(inputPath, Buffer.from(await fullRes.arrayBuffer()));
    } else {
      await writeFile(inputPath, Buffer.from(await res.arrayBuffer()));
    }

    const success = await new Promise<boolean>((resolve) => {
      const proc = spawn(
        FFMPEG_PATH,
        [
          "-i", inputPath,
          "-ss", "0.5",
          "-vframes", "1",
          "-q:v", "4",
          "-vf", "scale=640:-1",
          "-y",
          outputPath,
        ],
        { timeout: 30000 }
      );

      let stderr = "";
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });

      proc.on("close", (code) => {
        if (code !== 0) {
          console.error(`[Thumbnail] ffmpeg failed for ${mediaId}:`, stderr.slice(-500));
        }
        resolve(code === 0);
      });

      proc.on("error", (err) => {
        console.error(`[Thumbnail] ffmpeg spawn error for ${mediaId}:`, err);
        resolve(false);
      });
    });

    if (!success) return null;

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
