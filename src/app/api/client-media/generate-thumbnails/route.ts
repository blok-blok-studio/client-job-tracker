import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { put } from "@vercel/blob";
import { spawn } from "child_process";
import { writeFile, unlink, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

export const maxDuration = 3000;

/**
 * POST /api/client-media/generate-thumbnails
 *
 * Generates JPEG thumbnails for all VIDEO files that don't have one yet.
 * Uses ffmpeg to extract a frame at 0.5s, uploads to Vercel Blob,
 * and stores the thumbnail URL in the database.
 *
 * Can also accept { id: string } to generate for a single file.
 * Protected by cron secret or session auth (middleware).
 */
export async function POST(request: NextRequest) {
  // Auth: accept cron secret header or session cookie
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const sessionCookie = request.cookies.get("bb_session")?.value;

  if (!sessionCookie && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const singleId = body?.id as string | undefined;

    // Find videos without thumbnails
    const where = {
      fileType: "VIDEO" as const,
      thumbnailUrl: null,
      ...(singleId ? { id: singleId } : {}),
    };

    const videos = await prisma.clientMedia.findMany({
      where,
      select: { id: true, url: true, filename: true },
      take: 20, // Process in batches
    });

    if (videos.length === 0) {
      return NextResponse.json({ success: true, message: "No videos need thumbnails", generated: 0 });
    }

    let generated = 0;
    const errors: string[] = [];

    for (const video of videos) {
      try {
        const thumbUrl = await generateThumbnail(video.url, video.id);
        if (thumbUrl) {
          await prisma.clientMedia.update({
            where: { id: video.id },
            data: { thumbnailUrl: thumbUrl },
          });
          generated++;
        } else {
          errors.push(`${video.filename}: ffmpeg failed`);
        }
      } catch (err) {
        errors.push(`${video.filename}: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    return NextResponse.json({
      success: true,
      generated,
      total: videos.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

async function generateThumbnail(videoUrl: string, mediaId: string): Promise<string | null> {
  const workDir = join(tmpdir(), `thumb-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  const inputPath = join(workDir, "input.mp4");
  const outputPath = join(workDir, "thumb.jpg");

  try {
    // Download video (just first 10MB — enough for ffmpeg to extract a frame)
    const res = await fetch(videoUrl, {
      headers: { Range: "bytes=0-10485759" },
    });
    if (!res.ok && res.status !== 206) {
      // Try without range header as fallback
      const fullRes = await fetch(videoUrl);
      if (!fullRes.ok) throw new Error(`Download failed: ${fullRes.status}`);
      await writeFile(inputPath, Buffer.from(await fullRes.arrayBuffer()));
    } else {
      await writeFile(inputPath, Buffer.from(await res.arrayBuffer()));
    }

    // Extract frame with ffmpeg
    const success = await new Promise<boolean>((resolve) => {
      const proc = spawn("ffmpeg", [
        "-i", inputPath,
        "-ss", "0.5",        // Seek to 0.5s
        "-vframes", "1",     // Extract 1 frame
        "-q:v", "4",         // JPEG quality (2=best, 31=worst, 4=good)
        "-vf", "scale=640:-1", // Scale to 640px width, keep aspect ratio
        "-y",                // Overwrite
        outputPath,
      ], { timeout: 30000 });

      let stderr = "";
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });

      proc.on("close", (code) => {
        if (code !== 0) {
          console.error(`[Thumbnail] ffmpeg failed for ${mediaId}:`, stderr.slice(-500));
        }
        resolve(code === 0);
      });

      proc.on("error", () => resolve(false));
    });

    if (!success) return null;

    // Read and upload thumbnail
    const { readFile } = await import("fs/promises");
    const thumbBuffer = await readFile(outputPath);

    if (thumbBuffer.length < 100) return null; // Invalid/empty image

    const blob = await put(`thumbnails/${mediaId}.jpg`, thumbBuffer, {
      access: "public",
      allowOverwrite: true,
      contentType: "image/jpeg",
    });

    return blob.url;
  } finally {
    // Cleanup temp files
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
    await import("fs/promises").then((fs) => fs.rmdir(workDir).catch(() => {}));
  }
}
