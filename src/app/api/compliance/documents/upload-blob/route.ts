import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth";

// Team-side tax document upload — client-side Vercel Blob token handler.
// Files go directly browser → Blob; the document record is updated by the
// compliance page calling POST /api/compliance/documents/[id]/attach afterwards.
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await getSession();
        if (!session) throw new Error("Unauthorized");
        return {
          maximumSizeInBytes: 25 * 1024 * 1024,
          allowedContentTypes: [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/heic",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ],
          allowOverwrite: true,
          tokenPayload: JSON.stringify({ userId: session.id }),
        };
      },
      onUploadCompleted: async () => {
        // Record updated by /attach — the upload callback can't reach localhost in dev.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch {
    return NextResponse.json({ error: "Upload authorization failed" }, { status: 400 });
  }
}
