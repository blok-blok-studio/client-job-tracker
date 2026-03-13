import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET — list media for a client
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const clientId = searchParams.get("clientId");
  const fileType = searchParams.get("fileType");
  const search = searchParams.get("search");

  if (!clientId) {
    return NextResponse.json({ success: false, error: "clientId required" }, { status: 400 });
  }

  const where: Record<string, unknown> = { clientId };
  if (fileType) where.fileType = fileType;
  if (search) {
    where.OR = [
      { filename: { contains: search, mode: "insensitive" } },
      { label: { contains: search, mode: "insensitive" } },
    ];
  }

  const media = await prisma.clientMedia.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ success: true, data: media });
}

// POST — manager uploads media for a client
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const clientId = formData.get("clientId") as string;
    const files = formData.getAll("files") as File[];

    if (!clientId || files.length === 0) {
      return NextResponse.json({ success: false, error: "clientId and files required" }, { status: 400 });
    }

    // Upload files to blob storage
    const uploadForm = new FormData();
    files.forEach((f) => uploadForm.append("files", f));

    const uploadRes = await fetch(new URL("/api/uploads", request.url), {
      method: "POST",
      body: uploadForm,
    });
    const uploadData = await uploadRes.json();

    if (!uploadData.success) {
      return NextResponse.json({ success: false, error: uploadData.error }, { status: 400 });
    }

    // Create media records
    const records = await Promise.all(
      uploadData.urls.map(async (url: string, i: number) => {
        const file = files[i];
        const fileType = file.type.startsWith("image/")
          ? "IMAGE"
          : file.type.startsWith("video/")
          ? "VIDEO"
          : file.type.startsWith("audio/")
          ? "AUDIO"
          : "IMAGE";

        return prisma.clientMedia.create({
          data: {
            clientId,
            url,
            filename: file.name,
            fileType,
            fileSize: file.size,
            mimeType: file.type,
            uploadedBy: "manager",
          },
        });
      })
    );

    return NextResponse.json({ success: true, data: records }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upload media";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
