import { NextRequest, NextResponse } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { uploadFileToBlob } from "@/lib/upload";

export const maxDuration = 3000;

export async function POST(request: NextRequest) {
  // Rate limit: 20 uploads per minute per IP
  const ip = getClientIp(request);
  const rl = rateLimit(ip, { max: 20, windowMs: 60_000, prefix: "upload" });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Upload rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json(
        { success: false, error: "No files provided" },
        { status: 400 }
      );
    }

    const urls: string[] = [];

    for (const file of files) {
      const result = await uploadFileToBlob(file);
      urls.push(result.url);
    }

    return NextResponse.json({ success: true, urls });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
