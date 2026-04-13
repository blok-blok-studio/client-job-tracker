import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

// Manager-facing Vercel Blob upload token handler.
// Files go directly from browser → Vercel Blob (no size limit).
// Authenticated via session cookie (middleware handles auth).
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // Session auth is handled by middleware — if we got here, user is authenticated
        return {
          maximumSizeInBytes: 500 * 1024 * 1024, // 500MB
          allowOverwrite: true,
        };
      },
      onUploadCompleted: async () => {
        // DB registration is done by the caller after upload completes
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
