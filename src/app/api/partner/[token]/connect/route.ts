import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { findRepByToken } from "@/lib/partner-portal";
import { startConnectOnboarding, connectDashboardLink, PayoutError } from "@/lib/partner-payout";

// GET — the partner admin starts (or resumes) Stripe Connect onboarding from
// their own portal. Stripe account links expire within minutes, so they are
// minted on click and the browser is sent straight to Stripe. Once the
// account is live the same button opens their Stripe Express dashboard.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = rateLimit(getClientIp(request), { max: 10, prefix: "partner-connect" });
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }
  const { token } = await params;
  const rep = await findRepByToken(token);
  if (!rep) {
    return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
  }
  if (!rep.isAdmin) {
    return NextResponse.json({ success: false, error: "Only the partner admin can set up payouts" }, { status: 403 });
  }

  try {
    if (rep.partner.connectOnboarded) {
      return NextResponse.redirect(await connectDashboardLink(rep.partnerId));
    }
    const { url } = await startConnectOnboarding(rep.partnerId);
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("[partner/connect] failed:", err);
    const msg = err instanceof PayoutError ? err.message : "Stripe could not start onboarding. Contact Chase.";
    const back = new URL(`${APP_URL}/partner/${token}`);
    back.searchParams.set("stripe_error", msg);
    return NextResponse.redirect(back);
  }
}
