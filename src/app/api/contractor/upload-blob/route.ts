import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import prisma from "@/lib/prisma";

// Contractor invoice upload — client-side Vercel Blob token handler.
// Files go directly browser → Blob; the DB record is created by the
// contractor page calling POST /api/contractor/[token] afterwards.
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = clientPayload ? JSON.parse(clientPayload) : null;
        if (!payload?.token) throw new Error("Token required");

        const contractor = await prisma.contractor.findUnique({
          where: { uploadToken: payload.token },
          select: { id: true, isActive: true },
        });

        if (!contractor || !contractor.isActive) {
          throw new Error("Invalid upload link");
        }

        // Finished-work uploads: any file type (design sources, video, zips…),
        // stored byte-for-byte — never restrict or transform deliverables.
        if (payload.purpose === "work") {
          return {
            maximumSizeInBytes: 2 * 1024 * 1024 * 1024, // 2GB
            allowOverwrite: true,
            tokenPayload: JSON.stringify({ contractorId: contractor.id }),
          };
        }

        return {
          maximumSizeInBytes: 25 * 1024 * 1024, // 25MB — invoices are documents
          allowedContentTypes: [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/heic",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/csv",
          ],
          allowOverwrite: true,
          tokenPayload: JSON.stringify({ contractorId: contractor.id }),
        };
      },
      onUploadCompleted: async () => {
        // DB record is created by POST /api/contractor/[token] — the upload
        // callback can't reach localhost in dev, so we don't rely on it.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch {
    // Don't echo internal error text back to the caller
    return NextResponse.json({ error: "Upload authorization failed" }, { status: 400 });
  }
}
