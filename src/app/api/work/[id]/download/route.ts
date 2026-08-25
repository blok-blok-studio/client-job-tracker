import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Forced download for a Work-tab file. Linking straight at the Blob URL only
// ever opened the file inline (a video just started playing in a new tab and
// never saved), because `download` on an <a> is ignored cross-origin. This
// route sets the disposition instead.
//
// Above the proxy limit we redirect to the Blob CDN rather than pull the bytes
// through the function — buffering a multi-hundred-MB delivery OOM-kills the
// instance. Smaller files proxy so the original filename survives.
const PROXY_LIMIT_BYTES = 100 * 1024 * 1024;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const file = await prisma.contractorWorkFile.findUnique({
    where: { id },
    select: { url: true, filename: true, mimeType: true, fileSize: true },
  });

  if (!file) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  if (!file.fileSize || file.fileSize > PROXY_LIMIT_BYTES) {
    const sep = file.url.includes("?") ? "&" : "?";
    return NextResponse.redirect(`${file.url}${sep}download=1`, 302);
  }

  // `cache: "no-store"` keeps Next from buffering the whole body to cache it.
  const res = await fetch(file.url, { cache: "no-store" });
  if (!res.ok || !res.body) {
    return NextResponse.json({ success: false, error: "Failed to fetch file" }, { status: 502 });
  }

  const headers: Record<string, string> = {
    "Content-Type": file.mimeType || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
  };

  const contentLength = res.headers.get("content-length");
  if (contentLength) headers["Content-Length"] = contentLength;

  return new NextResponse(res.body, { headers });
}
