import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

/**
 * GET /api/client-media/thumb?url=...
 *
 * Proxies a Vercel Blob video URL with the correct Content-Type header.
 * Streams the response to avoid Vercel's 4.5MB body size limit.
 * Used as fallback for old .mov files stored with content-type: text/plain.
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
    // Request first 4MB — enough for most video decoders to extract a frame
    const res = await fetch(url, {
      headers: { Range: "bytes=0-4194303" },
    });

    if (!res.ok && res.status !== 206) {
      return NextResponse.json({ error: `Fetch failed: ${res.status}` }, { status: res.status });
    }

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

    // Stream the response body through to avoid buffering the whole thing
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json({ error: "Proxy failed" }, { status: 500 });
  }
}
