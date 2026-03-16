import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { del } from "@vercel/blob";

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
