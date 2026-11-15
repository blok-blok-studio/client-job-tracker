import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/lifecycle/settings";
import { DIGEST_SETTING, weeklyDigestText } from "@/lib/analytics/digest";

// GET /api/analytics/settings — is the Monday Slack summary on, and what would it say right now
export async function GET() {
  return NextResponse.json({
    success: true,
    data: { weeklyDigest: await getSetting<boolean>(DIGEST_SETTING, false), preview: await weeklyDigestText() },
  });
}

// PATCH /api/analytics/settings — owner only
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (session?.role !== "OWNER") return NextResponse.json({ success: false, error: "Only the owner can change this" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.weeklyDigest !== "boolean") return NextResponse.json({ success: false, error: "Nothing to change" }, { status: 400 });
  await setSetting(DIGEST_SETTING, body.weeklyDigest, session.name);
  return NextResponse.json({ success: true, data: { weeklyDigest: body.weeklyDigest } });
}
