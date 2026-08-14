import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth";

// Team-side contractor photo upload — client-side Vercel Blob token handler.
// The URL is stored on the contractor by PATCH /api/contractors/[id].
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
          maximumSizeInBytes: 8 * 1024 * 1024, // a photo, not a document
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
          allowOverwrite: true,
          tokenPayload: JSON.stringify({ userId: session.id }),
        };
      },
      onUploadCompleted: async () => {
        // Stored by the PATCH that follows — the callback can't reach localhost in dev.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch {
    return NextResponse.json({ error: "Upload authorization failed" }, { status: 400 });
  }
}
