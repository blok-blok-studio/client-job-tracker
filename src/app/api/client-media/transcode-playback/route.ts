import { NextRequest, NextResponse } from "next/server";
import { backfillMissingPlayback } from "@/lib/server-video-thumbnail";

export const maxDuration = 300;

/**
 * POST /api/client-media/transcode-playback
 *
 * Transcodes up to N videos that don't yet have a web-safe MP4 playback URL.
 * Default batch size is 3 because each transcode can take 30–90s and we have
 * a 300s function ceiling.
 *
 * Protected by cron secret header or session cookie (middleware).
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const sessionCookie = request.cookies.get("bb_session")?.value;

  if (!sessionCookie && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await backfillMissingPlayback(3);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
