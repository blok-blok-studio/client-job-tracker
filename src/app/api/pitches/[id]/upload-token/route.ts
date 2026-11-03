import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import prisma from "@/lib/prisma";
import { requirePitchUser, canEdit } from "@/lib/pitches/access";
import { IMAGE_TYPES, MAX_UPLOAD_BYTES, uploadPrefix } from "@/lib/pitches/images";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// Short-lived token so the browser can put one large image straight into Blob
// storage under this pitch's temp folder. The logo/images routes then read it,
// shrink it, store the result and delete the temp file.
export async function POST(request: Request, { params }: Ctx) {
  const { user, denied } = await requirePitchUser();
  if (denied) return denied;
  const { id } = await params;
  const pitch = await prisma.pitch.findUnique({ where: { id }, select: { authorId: true } });
  if (!pitch) return NextResponse.json({ error: "Pitch not found" }, { status: 404 });
  if (!canEdit(user, pitch)) return NextResponse.json({ error: "Only the author or Chase can change this pitch" }, { status: 403 });
  try {
    const body = (await request.json()) as HandleUploadBody;
    if (body.type !== "blob.generate-client-token") return NextResponse.json({ error: "Not supported" }, { status: 400 });
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(uploadPrefix(id)) || pathname.includes("..")) throw new Error("Bad path");
        return { allowedContentTypes: IMAGE_TYPES, maximumSizeInBytes: MAX_UPLOAD_BYTES, addRandomSuffix: true, validUntil: Date.now() + 10 * 60_000 };
      },
    });
    return NextResponse.json(json);
  } catch {
    return NextResponse.json({ error: "Could not start the upload" }, { status: 400 });
  }
}
