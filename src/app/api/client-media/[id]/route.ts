import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { del } from "@vercel/blob";

// PATCH — update media label/notes/thumbnailUrl
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { label, notes, thumbnailUrl } = body;

    // Validate input types and lengths
    if (label !== undefined && (typeof label !== "string" || label.length > 500)) {
      return NextResponse.json({ success: false, error: "Label must be a string under 500 characters" }, { status: 400 });
    }
    if (notes !== undefined && (typeof notes !== "string" || notes.length > 5000)) {
      return NextResponse.json({ success: false, error: "Notes must be a string under 5000 characters" }, { status: 400 });
    }
    if (thumbnailUrl !== undefined && typeof thumbnailUrl !== "string") {
      return NextResponse.json({ success: false, error: "thumbnailUrl must be a string" }, { status: 400 });
    }
    if (thumbnailUrl && !thumbnailUrl.startsWith("https://")) {
      return NextResponse.json({ success: false, error: "thumbnailUrl must be a valid HTTPS URL" }, { status: 400 });
    }

    // Verify the media record exists
    const existing = await prisma.clientMedia.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Media not found" }, { status: 404 });
    }

    const media = await prisma.clientMedia.update({
      where: { id },
      data: {
        ...(label !== undefined && { label }),
        ...(notes !== undefined && { notes }),
        ...(thumbnailUrl !== undefined && { thumbnailUrl }),
      },
    });

    return NextResponse.json({ success: true, data: media });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update media" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const media = await prisma.clientMedia.findUnique({
      where: { id },
      select: { id: true, url: true, filename: true, clientId: true },
    });

    if (!media) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    // Delete from blob storage
    try {
      await del(media.url);
    } catch (err) {
      console.warn("[Blob] Failed to delete blob:", err);
    }

    // Delete database record
    await prisma.clientMedia.delete({ where: { id } });

    await prisma.activityLog.create({
      data: {
        clientId: media.clientId,
        actor: "chase",
        action: "media_deleted",
        details: `Deleted media file: ${media.filename}`,
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to delete media" }, { status: 500 });
  }
}
