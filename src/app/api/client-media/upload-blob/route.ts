import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import prisma from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";

// Client-side Vercel Blob upload handler
// Files go directly from browser → Vercel Blob (no size limit)
// This route only handles token generation + DB record creation on completion
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        // clientPayload contains the token + clientId sent from the upload portal
        const payload = clientPayload ? JSON.parse(clientPayload) : null;
        if (!payload?.token) throw new Error("Token required");

        // Validate the upload token
        const client = await prisma.client.findUnique({
          where: { uploadToken: payload.token },
          select: { id: true, name: true, type: true },
        });

        if (!client || client.type === "ARCHIVED") {
          throw new Error("Invalid upload link");
        }

        return {
          // Allow all file types
          maximumSizeInBytes: 500 * 1024 * 1024, // 500MB per file
          tokenPayload: JSON.stringify({
            clientId: client.id,
            clientName: client.name,
            uploadedBy: payload.uploadedBy || "client",
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Called by Vercel when the upload finishes
        try {
          const { clientId, clientName, uploadedBy } = JSON.parse(tokenPayload || "{}");
          if (!clientId) return;

          const filename = blob.pathname.split("/").pop() || blob.pathname;
          const fileType = blob.contentType?.startsWith("image/")
            ? "IMAGE"
            : blob.contentType?.startsWith("video/")
            ? "VIDEO"
            : blob.contentType?.startsWith("audio/")
            ? "AUDIO"
            : "DOCUMENT";

          await prisma.clientMedia.create({
            data: {
              clientId,
              url: blob.url,
              filename,
              fileType,
              fileSize: 0, // Size populated by onUploadCompleted doesn't include it
              mimeType: blob.contentType || "application/octet-stream",
              uploadedBy,
            },
          });

          // Log activity
          await prisma.activityLog.create({
            data: {
              clientId,
              actor: uploadedBy === "client" ? clientName : "chase",
              action: "client_media_uploaded",
              details: `${uploadedBy === "client" ? clientName : "Manager"} uploaded: ${filename}`,
            },
          });

          // Notify via Telegram for client uploads
          if (uploadedBy === "client") {
            const chaseChatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
            if (chaseChatId) {
              sendTelegramMessage(
                chaseChatId,
                `📸 <b>${clientName}</b> uploaded: ${filename}`,
                "HTML"
              ).catch((err) => console.error("[Telegram] Upload notification failed:", err));
            }
          }
        } catch (err) {
          console.error("[Upload] onUploadCompleted error:", err);
          throw new Error("Could not save upload record");
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
