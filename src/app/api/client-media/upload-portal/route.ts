import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { put } from "@vercel/blob";
import { randomUUID } from "crypto";
import { sendTelegramMessage } from "@/lib/telegram";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB for client uploads (4K video)
const ACCEPTED_MIMES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic",
  "video/mp4", "video/quicktime", "video/webm", "video/x-msvideo",
  "audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg", "audio/webm",
]);

// GET — validate token and get client info
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ success: false, error: "Token required" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({
    where: { uploadToken: token },
    select: { id: true, name: true, company: true, avatarUrl: true },
  });

  if (!client) {
    return NextResponse.json({ success: false, error: "Invalid upload link" }, { status: 404 });
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
      select: { id: true, name: true },
    });

    if (!client) {
      return NextResponse.json({ success: false, error: "Invalid upload link" }, { status: 404 });
    }

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: "No files provided" }, { status: 400 });
    }

    if (files.length > 20) {
      return NextResponse.json({ success: false, error: "Maximum 20 files per upload" }, { status: 400 });
    }

    const results = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        results.push({ filename: file.name, error: `Exceeds 500MB limit` });
        continue;
      }
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
        : "IMAGE";

      const record = await prisma.clientMedia.create({
        data: {
          clientId: client.id,
          url: blob.url,
          filename: file.name,
          fileType: fileType as "IMAGE" | "VIDEO" | "AUDIO",
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
