import { NextResponse } from "next/server";
import { publishDuePosts } from "@/lib/social/publish-runner";

export const maxDuration = 300;

// POST: Publish due posts on demand (session-authenticated via middleware).
// The content page no longer polls this; the per-minute cron does the work.
// Kept for manual triggers and shares the runner, so it can't double-post.
export async function POST() {
  const run = await publishDuePosts({ actor: "auto-publish", limit: 10 });
  return NextResponse.json({ success: true, ...run });
}
