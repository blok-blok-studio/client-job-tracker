import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { renderSlideshow, SlideshowError, SLIDESHOW_MAX_SLIDES } from "@/lib/social/slideshow";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

// POST — turn a post's photos plus an audio track into one 9:16 video in the
// client's library (how a "carousel with audio" gets posted as a Reel).
// Body: { clientId, imageUrls, audioUrl, secondsPerSlide: number | "match", fit: "pad" | "crop", audioStart? }
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const audioUrl = typeof body.audioUrl === "string" ? body.audioUrl : "";
  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.filter((u): u is string => typeof u === "string") : [];
  if (!clientId || !audioUrl || imageUrls.length === 0) {
    return NextResponse.json({ success: false, error: "clientId, imageUrls and audioUrl are required" }, { status: 400 });
  }
  if (imageUrls.length > SLIDESHOW_MAX_SLIDES) {
    return NextResponse.json({ success: false, error: `Up to ${SLIDESHOW_MAX_SLIDES} photos.` }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

  try {
    const video = await renderSlideshow({
      imageUrls,
      audioUrl,
      secondsPerSlide: body.secondsPerSlide === "match" ? "match" : Number(body.secondsPerSlide) || 3,
      fit: body.fit === "crop" ? "crop" : "pad",
      audioStart: Number(body.audioStart) || 0,
      timeoutMs: 700_000,
    });

    const record = await prisma.clientMedia.create({
      data: {
        clientId,
        url: video.url,
        filename: `reel-${imageUrls.length}-photos-${new Date().toISOString().slice(0, 10)}.mp4`,
        fileType: "VIDEO",
        fileSize: video.size,
        mimeType: "video/mp4",
        width: video.width,
        height: video.height,
        duration: video.duration,
        thumbnailUrl: video.thumbnailUrl,
        label: "Reel made from photos + audio",
        uploadedBy: "manager",
      },
    });

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (err) {
    if (err instanceof SlideshowError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    console.error("[slideshow] render failed:", err);
    return NextResponse.json({ success: false, error: "Couldn't make the video. Try again, or use a different audio file." }, { status: 500 });
  }
}
