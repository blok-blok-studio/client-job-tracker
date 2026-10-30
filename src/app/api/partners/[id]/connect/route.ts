import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { startConnectOnboarding, refreshConnectStatus, connectDashboardLink, PayoutError } from "@/lib/partner-payout";

// Stripe Connect for a partner.
// POST — create the Express account (if needed) and return the hosted onboarding link
// GET  — pull the live status from Stripe (and ?dashboard=1 for a login link)

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const result = await startConnectOnboarding(id);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof PayoutError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    console.error("[partners/connect] failed:", err);
    const msg = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json({ success: false, error: `Stripe: ${msg}` }, { status: 502 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }
  const { id } = await params;
  const wantsDashboard = new URL(request.url).searchParams.get("dashboard") === "1";
  try {
    if (wantsDashboard) {
      const url = await connectDashboardLink(id);
      return NextResponse.json({ success: true, data: { url } });
    }
    const status = await refreshConnectStatus(id);
    return NextResponse.json({ success: true, data: status });
  } catch (err) {
    if (err instanceof PayoutError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    console.error("[partners/connect] status failed:", err);
    const msg = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json({ success: false, error: `Stripe: ${msg}` }, { status: 502 });
  }
}
