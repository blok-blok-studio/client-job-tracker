import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { put } from "@vercel/blob";
import { randomUUID } from "crypto";
import { sendTelegramMessage } from "@/lib/telegram";

export const maxDuration = 3000;

// PUT — stream a single file directly to Vercel Blob
// The file body is sent as raw bytes (not multipart), so Vercel's body parser
// doesn't buffer the entire request — this bypasses the 4.5MB body size limit.
export async function PUT(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    const filename = request.nextUrl.searchParams.get("filename") || "upload";
    const contentType = request.headers.get("content-type") || "application/octet-stream";

    if (!token) {
      return NextResponse.json({ success: false, error: "Token required" }, { status: 400 });
    }

    const client = await prisma.client.findUnique({
      where: { uploadToken: token },
      select: { id: true, name: true, type: true },
    });

    if (!client || client.type === "ARCHIVED") {
      return NextResponse.json(
        { success: false, error: "Invalid upload link" },
        { status: !client ? 404 : 410 }
      );
    }

    if (!request.body) {
      return NextResponse.json({ success: false, error: "No file body" }, { status: 400 });
    }

    // Stream file directly to Vercel Blob — no buffering
    const ext = filename.includes(".") ? "." + filename.split(".").pop() : "";
    const blobPath = `client-media/${client.id}/${randomUUID()}${ext}`;

    const blob = await put(blobPath, request.body, {
      access: "public",
      allowOverwrite: true,
      contentType,
    });

    const fileType = contentType.startsWith("image/")
      ? "IMAGE"
      : contentType.startsWith("video/")
      ? "VIDEO"
      : contentType.startsWith("audio/")
      ? "AUDIO"
      : "DOCUMENT";

    const contentLength = request.headers.get("content-length");
    const fileSize = contentLength ? parseInt(contentLength) : 0;

    const record = await prisma.clientMedia.create({
      data: {
        clientId: client.id,
        url: blob.url,
        filename,
        fileType: fileType as "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT",
        fileSize,
        mimeType: contentType,
        uploadedBy: "client",
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        clientId: client.id,
        actor: client.name,
        action: "client_media_uploaded",
        details: `${client.name} uploaded: ${filename}`,
      },
    });

    // Notify via Telegram
    const chaseChatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
    if (chaseChatId) {
      sendTelegramMessage(
        chaseChatId,
        `📸 <b>${client.name}</b> uploaded: ${filename}`,
        "HTML"
      ).catch((err) => console.error("[Telegram] Upload notification failed:", err));
    }

    return NextResponse.json(
      { success: true, data: [{ filename, url: blob.url, id: record.id }] },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("[Upload Stream] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
