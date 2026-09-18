import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { renderVideoWithAudio, VideoAudioError } from "@/lib/social/video-audio";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/** Must match the label the composer looks for after a dropped connection. */
const LABEL = "Video with added audio";

// POST — lay an audio track over a video and save the result to the client's
// library. The picture is copied untouched; only the sound changes.
// Body: { clientId, videoUrl, audioUrl, keepOriginal, trackVolume?, originalVolume?, audioStart? }
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl : "";
  const audioUrl = typeof body.audioUrl === "string" ? body.audioUrl : "";
  if (!clientId || !videoUrl || !audioUrl) {
    return NextResponse.json({ success: false, error: "clientId, videoUrl and audioUrl are required" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

  const source = await prisma.clientMedia.findFirst({
    where: { clientId, url: videoUrl },
    select: { filename: true, thumbnailUrl: true },
  });

  try {
    const video = await renderVideoWithAudio({
      videoUrl,
      audioUrl,
      keepOriginal: body.keepOriginal === true,
      trackVolume: body.trackVolume as number | undefined,
      originalVolume: body.originalVolume as number | undefined,
      audioStart: Number(body.audioStart) || 0,
      timeoutMs: 700_000,
    });

    const base = (source?.filename || "video").replace(/\.[a-z0-9]+$/i, "");
    const record = await prisma.clientMedia.create({
      data: {
        clientId,
        url: video.url,
        filename: `${base}-with-audio.mp4`,
        fileType: "VIDEO",
        fileSize: video.size,
        mimeType: "video/mp4",
        width: video.width,
        height: video.height,
        duration: video.duration,
        // Same picture as the source, so its thumbnail still fits
        thumbnailUrl: source?.thumbnailUrl ?? null,
        label: LABEL,
        uploadedBy: "manager",
      },
    });

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (err) {
    if (err instanceof VideoAudioError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    console.error("[audio-mix] render failed:", err);
    return NextResponse.json({ success: false, error: "Couldn't add the audio. Try again, or use a different audio file." }, { status: 500 });
  }
}
