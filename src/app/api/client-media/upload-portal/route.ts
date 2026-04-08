import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { sendTelegramMessage } from "@/lib/telegram";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB for client uploads (4K video)
const ACCEPTED_MIMES = [
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
];

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

// POST — direct-to-blob client upload handshake.
//
// Files are uploaded straight from the browser to Vercel Blob via
// `upload()` from `@vercel/blob/client`. This endpoint only:
//   1. Signs a short-lived upload token after validating the client's
//      uploadToken (onBeforeGenerateToken)
//   2. Records the ClientMedia DB row + activity log once the browser
//      finishes the upload (onUploadCompleted)
//
// The file bytes NEVER pass through this serverless function, which
// bypasses Vercel's ~4.5MB request body limit and lets clients upload
// up to 500MB (4K video) without hitting "Upload failed".
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!clientPayload) {
          throw new Error("Missing client payload");
        }

        let payload: { token?: string; filename?: string; size?: number };
        try {
          payload = JSON.parse(clientPayload);
        } catch {
          throw new Error("Invalid client payload");
        }

        const token = payload.token;
        if (!token) {
          throw new Error("Token required");
        }

        const client = await prisma.client.findUnique({
          where: { uploadToken: token },
          select: { id: true, name: true, type: true },
        });

        if (!client) {
          throw new Error("Invalid upload link");
        }
        if (client.type === "ARCHIVED") {
          throw new Error("This upload link has been archived");
        }

        if (typeof payload.size === "number" && payload.size > MAX_FILE_SIZE) {
          throw new Error("Exceeds 500MB limit");
        }

        return {
          allowedContentTypes: ACCEPTED_MIMES,
          maximumSizeInBytes: MAX_FILE_SIZE,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({
            clientId: client.id,
            clientName: client.name,
            originalFilename: payload.filename ?? pathname.split("/").pop() ?? "upload",
            size: payload.size ?? 0,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload) return;

        let payload: {
          clientId: string;
          clientName: string;
          originalFilename: string;
          size: number;
        };
        try {
          payload = JSON.parse(tokenPayload);
        } catch (err) {
          console.error("[upload-portal] Failed to parse tokenPayload:", err);
          return;
        }

        const contentType = blob.contentType ?? "application/octet-stream";
        const fileType = contentType.startsWith("image/")
          ? "IMAGE"
          : contentType.startsWith("video/")
          ? "VIDEO"
          : contentType.startsWith("audio/")
          ? "AUDIO"
          : "DOCUMENT";

        try {
          await prisma.clientMedia.create({
            data: {
              clientId: payload.clientId,
              url: blob.url,
              filename: payload.originalFilename,
              fileType: fileType as "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT",
              fileSize: payload.size,
              mimeType: contentType,
              uploadedBy: "client",
            },
          });

          await prisma.activityLog.create({
            data: {
              clientId: payload.clientId,
              actor: payload.clientName,
              action: "client_media_uploaded",
              details: `${payload.clientName} uploaded ${payload.originalFilename}`,
            },
          });

          const chaseChatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
          if (chaseChatId) {
            await sendTelegramMessage(
              chaseChatId,
              `📸 <b>${payload.clientName}</b> just uploaded a file:\n${payload.originalFilename}`,
              "HTML"
            ).catch((err) => console.error("[Telegram] Upload notification failed:", err));
          }
        } catch (err) {
          // onUploadCompleted must throw on failure so Vercel Blob retries,
          // but we log the details first for debugging.
          console.error("[upload-portal] Failed to record uploaded media:", err);
          throw err;
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("[upload-portal] handleUpload error:", err);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
