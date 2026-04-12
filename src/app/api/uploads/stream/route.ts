import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import crypto from "crypto";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 300;

// PUT — stream a single file directly to Vercel Blob
// Receives raw file body (not multipart), so it bypasses the 4.5MB body parsing limit.
// Authenticated via session cookie (middleware handles auth).
export async function PUT(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = rateLimit(ip, { max: 20, windowMs: 60_000, prefix: "upload" });
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
      contentType,
    });

    return NextResponse.json({ success: true, urls: [blob.url] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
