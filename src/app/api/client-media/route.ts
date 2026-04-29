import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { uploadFileToBlob } from "@/lib/upload";
import { generateVideoThumbnail } from "@/lib/server-video-thumbnail";

export const maxDuration = 300;

// GET — list media, optionally filtered by client
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const clientId = searchParams.get("clientId");
  const fileType = searchParams.get("fileType");
  const search = searchParams.get("search");

  const excludeArchived = searchParams.get("excludeArchived") !== "false";

  const where: Record<string, unknown> = {};
  if (clientId) where.clientId = clientId;
  if (fileType) where.fileType = fileType;
  if (excludeArchived) where.client = { type: { not: "ARCHIVED" } };
  if (search) {
    where.OR = [
      { filename: { contains: search, mode: "insensitive" } },
      { label: { contains: search, mode: "insensitive" } },
    ];
  }

  const media = await prisma.clientMedia.findMany({
    where,
    include: { client: { select: { id: true, name: true, company: true, type: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ success: true, data: media });
}

// POST — manager uploads media for a client
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // JSON body = register a blob URL from streaming upload
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const { clientId, url, filename, fileType: mimeType, fileSize } = body;
      if (!clientId || !url) {
        return NextResponse.json({ success: false, error: "clientId and url required" }, { status: 400 });
      }

      const ft = (mimeType || "").startsWith("image/")
        ? "IMAGE"
        : (mimeType || "").startsWith("video/")
        ? "VIDEO"
        : (mimeType || "").startsWith("audio/")
        ? "AUDIO"
        : "DOCUMENT";

      const record = await prisma.clientMedia.create({
        data: {
          clientId,
          url,
          filename: filename || "upload",
          fileType: ft,
          fileSize: fileSize || 0,
          mimeType: mimeType || "application/octet-stream",
          uploadedBy: "manager",
        },
      });

      let finalRecord = record;
      if (ft === "VIDEO") {
        const thumbUrl = await generateVideoThumbnail(url, record.id).catch(() => null);
        if (thumbUrl) {
          finalRecord = await prisma.clientMedia.update({
            where: { id: record.id },
            data: { thumbnailUrl: thumbUrl },
          });
        }
      }

      return NextResponse.json({ success: true, data: [finalRecord] }, { status: 201 });
    }

    // FormData body = legacy upload path
    const formData = await request.formData();
    const clientId = formData.get("clientId") as string;
    const files = formData.getAll("files") as File[];

    if (!clientId || files.length === 0) {
      return NextResponse.json({ success: false, error: "clientId and files required" }, { status: 400 });
    }

    const records = [];
    const errors = [];

    for (const file of files) {
      try {
        const result = await uploadFileToBlob(file);

        const fileType = file.type.startsWith("image/")
          ? "IMAGE"
          : file.type.startsWith("video/")
          ? "VIDEO"
          : file.type.startsWith("audio/")
          ? "AUDIO"
          : "DOCUMENT";

        const record = await prisma.clientMedia.create({
          data: {
            clientId,
            url: result.url,
            filename: file.name,
            fileType,
            fileSize: file.size,
            mimeType: file.type,
            uploadedBy: "manager",
          },
        });

        let finalRecord = record;
        if (fileType === "VIDEO") {
          const thumbUrl = await generateVideoThumbnail(result.url, record.id).catch(() => null);
          if (thumbUrl) {
            finalRecord = await prisma.clientMedia.update({
              where: { id: record.id },
              data: { thumbnailUrl: thumbUrl },
            });
          }
        }

        records.push(finalRecord);
      } catch (err) {
        errors.push({
          filename: file.name,
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    }

    if (records.length === 0 && errors.length > 0) {
      return NextResponse.json(
        { success: false, error: errors[0].error, errors },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: records, errors }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upload media";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
