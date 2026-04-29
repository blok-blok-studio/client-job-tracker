import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateVideoThumbnail } from "@/lib/server-video-thumbnail";

export const maxDuration = 300;

/**
 * POST /api/client-media/generate-thumbnails
 *
 * Generates JPEG thumbnails for VIDEO files that don't have one yet.
 * Accepts an optional { id: string } body to target a single file.
 * Protected by cron secret header or session cookie (middleware).
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const sessionCookie = request.cookies.get("bb_session")?.value;

  if (!sessionCookie && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const singleId = body?.id as string | undefined;

    const where = {
      fileType: "VIDEO" as const,
      thumbnailUrl: null,
      ...(singleId ? { id: singleId } : {}),
    };

    const videos = await prisma.clientMedia.findMany({
      where,
      select: { id: true, url: true, filename: true },
      take: 20,
    });

    if (videos.length === 0) {
      return NextResponse.json({ success: true, message: "No videos need thumbnails", generated: 0 });
    }

    let generated = 0;
    const errors: string[] = [];

    for (const video of videos) {
      try {
        const thumbUrl = await generateVideoThumbnail(video.url, video.id);
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
