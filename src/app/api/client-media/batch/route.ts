import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { del } from "@vercel/blob";

// DELETE — batch delete multiple media files
export async function DELETE(request: NextRequest) {
  try {
    const { ids } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, error: "No IDs provided" }, { status: 400 });
    }

    if (ids.length > 100) {
      return NextResponse.json({ success: false, error: "Max 100 files per batch" }, { status: 400 });
    }

    // Ensure all IDs are non-empty strings
    if (!ids.every((id) => typeof id === "string" && id.length > 0)) {
      return NextResponse.json({ success: false, error: "All IDs must be non-empty strings" }, { status: 400 });
    }

    const mediaFiles = await prisma.clientMedia.findMany({
      where: { id: { in: ids } },
      select: { id: true, url: true, filename: true, clientId: true },
    });

    if (mediaFiles.length === 0) {
      return NextResponse.json({ success: false, error: "No files found" }, { status: 404 });
    }

    // Delete blobs from Vercel Blob storage
    const urls = mediaFiles.map((m) => m.url);
    await del(urls).catch((err) =>
      console.error("[Blob] Failed to delete some blobs:", err)
    );

    // Delete database records
    await prisma.clientMedia.deleteMany({
      where: { id: { in: mediaFiles.map((m) => m.id) } },
    });

    // Activity log — group by clientId
    const byClient = new Map<string, string[]>();
    for (const m of mediaFiles) {
      const list = byClient.get(m.clientId) || [];
      list.push(m.filename);
      byClient.set(m.clientId, list);
    }

    for (const [clientId, filenames] of byClient) {
      await prisma.activityLog.create({
        data: {
          clientId,
          actor: "chase",
          action: "media_deleted",
          details: `Batch deleted ${filenames.length} file${filenames.length !== 1 ? "s" : ""}: ${filenames.join(", ")}`,
        },
      });
    }

    return NextResponse.json({ success: true, deleted: mediaFiles.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Batch delete failed";
    console.error("[Batch Delete] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
