import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const media = await prisma.clientMedia.findUnique({
    where: { id },
    select: { url: true, filename: true, mimeType: true },
  });

  if (!media) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Proxy the file from Vercel Blob to force download
  const res = await fetch(media.url);
  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 502 });
  }

  const blob = await res.blob();

  return new NextResponse(blob, {
    headers: {
      "Content-Type": media.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(media.filename)}"`,
    },
  });
}
