import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveCredentialForPost } from "@/lib/social/publisher";
import { queryCreatorInfo } from "@/lib/social/platforms/tiktok";

/**
 * GET ?credentialId= → the TikTok account's live posting options.
 * TikTok's guidelines require the composer to load this before showing the
 * post form: nickname, allowed privacy levels, disabled interactions, max
 * video length. Session-gated by middleware.
 */
export async function GET(request: NextRequest) {
  const credentialId = request.nextUrl.searchParams.get("credentialId");
  if (!credentialId) {
    return NextResponse.json({ success: false, error: "credentialId is required" }, { status: 400 });
  }

  const row = await prisma.credential.findUnique({
    where: { id: credentialId },
    select: { id: true, clientId: true, platform: true },
  });
  if (!row || !row.platform.toLowerCase().includes("tiktok")) {
    return NextResponse.json({ success: false, error: "TikTok account not found" }, { status: 404 });
  }

  try {
    const credential = await resolveCredentialForPost({ clientId: row.clientId, credentialId: row.id, platform: "TIKTOK" });
    const info = await queryCreatorInfo(credential.password);
    return NextResponse.json({ success: true, data: info });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't load TikTok account settings";
    // TikTok says to stop and ask the user to retry later when posting is unavailable
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
