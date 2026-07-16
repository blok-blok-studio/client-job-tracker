import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/prisma";
import { del } from "@vercel/blob";
import { requestMeta } from "@/lib/request-meta";

// PATCH — batch assign multiple media files to an event/folder (or unfile with folder: null)
export async function PATCH(request: NextRequest) {
  try {
    const { ids, folder } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, error: "No IDs provided" }, { status: 400 });
    }
    if (ids.length > 500) {
      return NextResponse.json({ success: false, error: "Max 500 files per batch" }, { status: 400 });
    }
    if (!ids.every((id) => typeof id === "string" && id.length > 0)) {
      return NextResponse.json({ success: false, error: "All IDs must be non-empty strings" }, { status: 400 });
    }
    if (folder !== null && (typeof folder !== "string" || folder.length > 200)) {
      return NextResponse.json({ success: false, error: "Folder must be a string under 200 characters" }, { status: 400 });
    }

    const value = typeof folder === "string" ? folder.trim() || null : null;

    const result = await prisma.clientMedia.updateMany({
      where: { id: { in: ids } },
      data: { folder: value },
    });

    return NextResponse.json({ success: true, updated: result.count, folder: value });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Batch update failed";
    console.error("[Batch Assign Folder] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE — batch delete multiple media files
export async function DELETE(request: NextRequest) {
  const meta = requestMeta(request);
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

    // Delete database records now; blob cleanup and activity logs run after
    // the response so the UI isn't held up by storage round-trips.
    await prisma.clientMedia.deleteMany({
      where: { id: { in: mediaFiles.map((m) => m.id) } },
    });

    after(async () => {
      const urls = mediaFiles.map((m) => m.url);
      await del(urls).catch((err) =>
        console.error("[Blob] Failed to delete some blobs:", err)
      );

      // Activity log — group by clientId
      const byClient = new Map<string, string[]>();
      for (const m of mediaFiles) {
        const list = byClient.get(m.clientId) || [];
        list.push(m.filename);
        byClient.set(m.clientId, list);
      }

      await prisma.activityLog.createMany({
        data: Array.from(byClient, ([clientId, filenames]) => ({
          clientId,
          actor: "chase",
          action: "media_deleted",
          details: `Batch deleted ${filenames.length} file${filenames.length !== 1 ? "s" : ""}: ${filenames.join(", ")}`,
          ...meta,
        })),
      }).catch(() => {});
    });

    return NextResponse.json({ success: true, deleted: mediaFiles.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Batch delete failed";
    console.error("[Batch Delete] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
