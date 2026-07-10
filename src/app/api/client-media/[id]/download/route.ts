import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Above this size we redirect straight to the Blob CDN instead of proxying the
// bytes through this function. Proxying multi-hundred-MB client videos buffers
// them in the function and OOM-kills the instance ("Download failed"). The CDN
// streams natively at any size. Small files still proxy so we can restore the
// original filename via Content-Disposition.
const PROXY_LIMIT_BYTES = 100 * 1024 * 1024;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const media = await prisma.clientMedia.findUnique({
    where: { id },
    select: { url: true, filename: true, mimeType: true, fileSize: true },
  });

  if (!media) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Large (or unknown-size) files: hand the browser straight to the Blob CDN.
  // `?download=1` makes Blob serve it with an attachment Content-Disposition so
  // it downloads rather than opening inline.
  if (!media.fileSize || media.fileSize > PROXY_LIMIT_BYTES) {
    const sep = media.url.includes("?") ? "&" : "?";
    return NextResponse.redirect(`${media.url}${sep}download=1`, 302);
  }

  // Small files: proxy so we can force the download with the original filename.
  // `cache: "no-store"` keeps Next from buffering the whole body to cache it.
  const res = await fetch(media.url, { cache: "no-store" });
  if (!res.ok || !res.body) {
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 502 });
  }

  const headers: Record<string, string> = {
    "Content-Type": media.mimeType || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(media.filename)}"`,
  };

  const contentLength = res.headers.get("content-length");
  if (contentLength) headers["Content-Length"] = contentLength;

  return new NextResponse(res.body, { headers });
}
