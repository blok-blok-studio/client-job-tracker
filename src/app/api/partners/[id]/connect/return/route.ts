import { NextRequest, NextResponse } from "next/server";
import { refreshConnectStatus } from "@/lib/partner-payout";

// Stripe sends the partner back here after hosted onboarding (or when the
// onboarding link expired: ?refresh=1). We record the live status and land
// them on a plain page; no session is needed because the partner, not the
// owner, is the one arriving.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const qs = new URL(request.url).searchParams;
  const refresh = qs.get("refresh") === "1";
  let onboarded = false;
  try {
    onboarded = (await refreshConnectStatus(id)).onboarded;
  } catch (err) {
    console.error("[partners/connect/return] status failed:", err);
  }
  // Only ever bounce back into our own app (the partner portal), never to an
  // arbitrary URL from the query string.
  const to = qs.get("to");
  if (to && /^\/partner\/[\w-]+$/.test(to)) {
    const back = new URL(`${APP_URL}${to}`);
    back.searchParams.set("stripe", refresh ? "expired" : onboarded ? "done" : "pending");
    return NextResponse.redirect(back);
  }
  const url = new URL(`${APP_URL}/partner-connect`);
  url.searchParams.set("state", refresh ? "expired" : onboarded ? "done" : "pending");
  return NextResponse.redirect(url);
}
