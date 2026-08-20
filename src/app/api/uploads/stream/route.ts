import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import crypto from "crypto";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 300;

// PUT — stream a single file to Vercel Blob. Authenticated via session cookie.
//
// DEPRECATED for anything that isn't guaranteed small, and currently unused.
// Streaming avoids Next's body *parsing*, but Vercel still rejects any request
// body over 4.5MB at the edge with a plain-text 413 (FUNCTION_PAYLOAD_TOO_LARGE)
// before this handler runs — so callers cannot even report the failure properly.
// Upload browser → Blob instead: `upload()` from @vercel/blob/client against
// /api/uploads/blob, or the uploadFile() helper in src/lib/client-upload.ts.
export async function PUT(request: NextRequest) {
  const ip = getClientIp(request);
  // High enough that a folder drop (1 request per file) doesn't trip it
  const rl = rateLimit(ip, { max: 120, windowMs: 60_000, prefix: "upload" });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Upload rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const filename = request.nextUrl.searchParams.get("filename") || "upload";
    const contentType = request.headers.get("content-type") || "application/octet-stream";

    if (!request.body) {
      return NextResponse.json({ success: false, error: "No file body" }, { status: 400 });
    }

    const ext = filename.includes(".") ? "." + filename.split(".").pop() : "";
    const id = crypto.randomUUID();
    const blobPath = `media/${id}${ext}`;

    const blob = await put(blobPath, request.body, {
      access: "public",
      allowOverwrite: true,
      contentType,
    });

    return NextResponse.json({ success: true, urls: [blob.url] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
