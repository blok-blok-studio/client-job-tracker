import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { put } from "@vercel/blob";
import { randomUUID } from "crypto";
import { sendTelegramMessage } from "@/lib/telegram";

// No file size limit — clients upload 4K videos, large photo batches, etc.
export const maxDuration = 300;

// No artificial file size limit
const ACCEPTED_MIMES = new Set([
  // Images
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif",
  "image/svg+xml", "image/bmp", "image/tiff", "image/x-icon", "image/avif",
  // Videos
  "video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/x-matroska",
  "video/x-ms-wmv", "video/x-flv", "video/3gpp", "video/3gpp2", "video/ogg",
  "video/x-m4v", "video/mp2t",
  // Audio
  "audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg", "audio/webm",
  "audio/aac", "audio/flac", "audio/x-m4a", "audio/x-aiff",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "text/rtf", "application/rtf",
]);

// GET — validate token and get client info
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ success: false, error: "Token required" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({
    where: { uploadToken: token },
    select: { id: true, name: true, company: true, avatarUrl: true, type: true },
  });

  if (!client || client.type === "ARCHIVED") {
    return NextResponse.json({ success: false, error: "Invalid upload link" }, { status: !client ? 404 : 410 });
  }

  return NextResponse.json({ success: true, data: client });
}

// POST — client uploads files via their portal link
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const token = formData.get("token") as string;
    const files = formData.getAll("files") as File[];

    if (!token) {
      return NextResponse.json({ success: false, error: "Token required" }, { status: 400 });
    }

    const client = await prisma.client.findUnique({
      where: { uploadToken: token },
      select: { id: true, name: true, type: true },
    });

    if (!client || client.type === "ARCHIVED") {
      return NextResponse.json({ success: false, error: "Invalid upload link" }, { status: !client ? 404 : 410 });
    }

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: "No files provided" }, { status: 400 });
    }

    // No file count limit — files are uploaded one at a time from the portal

    const results = [];

    for (const file of files) {
      if (!ACCEPTED_MIMES.has(file.type)) {
        results.push({ filename: file.name, error: `Unsupported file type: ${file.type}` });
        continue;
      }

      const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
      const blobPath = `client-media/${client.id}/${randomUUID()}${ext}`;

      const blob = await put(blobPath, file, { access: "public" });

      const fileType = file.type.startsWith("image/")
        ? "IMAGE"
        : file.type.startsWith("video/")
        ? "VIDEO"
        : file.type.startsWith("audio/")
        ? "AUDIO"
        : "DOCUMENT";

      const record = await prisma.clientMedia.create({
        data: {
          clientId: client.id,
          url: blob.url,
          filename: file.name,
          fileType: fileType as "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT",
          fileSize: file.size,
          mimeType: file.type,
          uploadedBy: "client",
        },
      });

      results.push({ filename: file.name, url: blob.url, id: record.id });
    }

    const successCount = results.filter((r) => !("error" in r)).length;
    const fileNames = results.filter((r) => !("error" in r)).map((r) => r.filename).join(", ");

    // Log activity
    await prisma.activityLog.create({
      data: {
        clientId: client.id,
        actor: client.name,
        action: "client_media_uploaded",
        details: `${client.name} uploaded ${successCount} file${successCount !== 1 ? "s" : ""}: ${fileNames}`,
      },
    });

    // Notify Chase via Telegram
    const chaseChatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
    if (chaseChatId && successCount > 0) {
      sendTelegramMessage(
        chaseChatId,
        `📸 <b>${client.name}</b> just uploaded ${successCount} file${successCount !== 1 ? "s" : ""}:\n${fileNames}`,
        "HTML"
      ).catch((err) => console.error("[Telegram] Upload notification failed:", err));
    }

    return NextResponse.json({ success: true, data: results }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
