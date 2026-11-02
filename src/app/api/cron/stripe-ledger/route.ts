import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSetting } from "@/lib/lifecycle/settings";
import { syncStripeLedger } from "@/lib/invoicing/stripe-ledger";

export const maxDuration = 800;

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const a = crypto.createHash("sha256").update(header.replace("Bearer ", "")).digest();
  const b = crypto.createHash("sha256").update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

// Every 6 hours. Runs one full import until that has finished once, then only
// the last 120 days, which catches new payments and late refunds. Read-only at Stripe.
export async function GET(request: NextRequest) {
  if (!authorized(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const fullAt = await getSetting<string | null>("stripe_ledger_full_at", null);
    const r = await syncStripeLedger(fullAt ? "recent" : "full", "system");
    return NextResponse.json({ success: true, data: { mode: r.mode, payments: r.paymentsSeen, errors: r.errors.length } });
  } catch (err) {
    console.error("[Cron:stripe-ledger]", err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: "Sync failed" }, { status: 500 });
  }
}
