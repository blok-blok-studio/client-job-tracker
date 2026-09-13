import { NextResponse } from "next/server";
import { getYouTubeQuotaStatus } from "@/lib/social/youtube-quota";

// GET: today's YouTube upload/API budget, shared by every client's channel
// (session-authenticated via middleware)
export async function GET() {
  try {
    const data = await getYouTubeQuotaStatus();
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to read YouTube quota" }, { status: 500 });
  }
}
