import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import prisma from "@/lib/prisma";

// Client-side Vercel Blob upload token handler
// Files go directly from browser → Vercel Blob (no size limit)
// This route only generates upload tokens — DB records are created by upload-portal
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = clientPayload ? JSON.parse(clientPayload) : null;
        if (!payload?.token) throw new Error("Token required");

        const client = await prisma.client.findUnique({
          where: { uploadToken: payload.token },
          select: { id: true, name: true, type: true },
        });

        if (!client || client.type === "ARCHIVED") {
          throw new Error("Invalid upload link");
        }

        return {
          maximumSizeInBytes: 500 * 1024 * 1024, // 500MB
          tokenPayload: JSON.stringify({ clientId: client.id }),
        };
      },
      onUploadCompleted: async () => {
        // DB record is created by the client calling /api/client-media/upload-portal
        // onUploadCompleted can't reach localhost in dev, so we don't rely on it
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
