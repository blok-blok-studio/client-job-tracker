import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/client-media/thumb?url=...
 *
 * Proxies a Vercel Blob video URL with the correct Content-Type header.
 * This fixes the issue where .mov files stored with content-type: text/plain
 * can't be loaded by <video> elements in Chrome.
 *
 * Only proxies the first 5MB (enough for thumbnail extraction).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  // Only allow proxying from our Vercel Blob domain
  if (!url.includes(".public.blob.vercel-storage.com/")) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    // Fetch with a range header to limit download to first 5MB
    const res = await fetch(url, {
      headers: { Range: "bytes=0-5242879" },
    });

    if (!res.ok && res.status !== 206) {
      return NextResponse.json({ error: "Failed to fetch" }, { status: res.status });
    }

    const buffer = await res.arrayBuffer();

    // Determine correct content-type from the URL extension
    const ext = url.split("?")[0].split(".").pop()?.toLowerCase() || "";
    const mimeMap: Record<string, string> = {
      mov: "video/quicktime",
      mp4: "video/mp4",
      webm: "video/webm",
      avi: "video/x-msvideo",
      mkv: "video/x-matroska",
      m4v: "video/x-m4v",
      "3gp": "video/3gpp",
      flv: "video/x-flv",
      wmv: "video/x-ms-wmv",
      ogv: "video/ogg",
      ts: "video/mp2t",
    };
    const contentType = mimeMap[ext] || "video/mp4";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json({ error: "Proxy failed" }, { status: 500 });
  }
}
