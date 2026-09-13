import { NextRequest, NextResponse } from "next/server";
import { isAllowedBlobUrl } from "@/lib/blob-fetch";
import { readMediaToken } from "@/lib/social/platforms/tiktok";

/**
 * Public, signed media proxy for platforms that pull media from a verified
 * URL prefix (TikTok photo posts). The token is an HMAC-signed, expiring
 * pointer to one Vercel Blob image; nothing else can be fetched through it.
 *
 * The prefix to verify in the TikTok developer portal is
 * <TIKTOK_MEDIA_BASE_URL or NEXT_PUBLIC_APP_URL>/api/social/media/. If TikTok
 * verifies prefixes with a signature file, set TIKTOK_URL_VERIFY_FILENAME and
 * TIKTOK_URL_VERIFY_CONTENT and it's served from this same path.
 */

const IMAGE_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

async function handle(request: NextRequest, token: string, headOnly: boolean) {
  const verifyName = process.env.TIKTOK_URL_VERIFY_FILENAME;
  if (verifyName && token === verifyName) {
    return new NextResponse(headOnly ? null : process.env.TIKTOK_URL_VERIFY_CONTENT || "", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const blobUrl = readMediaToken(token);
  if (!blobUrl || !isAllowedBlobUrl(blobUrl)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = new URL(blobUrl).pathname.split(".").pop()?.toLowerCase() || "";
  const upstream = await fetch(blobUrl, { method: headOnly ? "HEAD" : "GET", redirect: "manual" });
  if (upstream.status !== 200) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contentType = upstream.headers.get("content-type") || IMAGE_TYPES[ext];
  if (!contentType || !/^image\/(jpeg|webp)/i.test(contentType)) {
    await upstream.body?.cancel();
    return NextResponse.json({ error: "Unsupported media" }, { status: 415 });
  }

  const headers = new Headers({ "Content-Type": contentType, "Cache-Control": "private, max-age=3600" });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  // Must answer 200 directly: TikTok treats redirects as invalid media URLs
  return new NextResponse(headOnly ? null : upstream.body, { status: 200, headers });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return handle(request, token, false);
}

export async function HEAD(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return handle(request, token, true);
}
