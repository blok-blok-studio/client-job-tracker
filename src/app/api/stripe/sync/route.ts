import { NextResponse } from "next/server";
import { requireOwner } from "@/app/api/studio-invoices/_shared";
import { syncStripeLedger } from "@/lib/invoicing/stripe-ledger";

export const maxDuration = 300;

// POST — pull every Stripe customer and payment into the command center.
// Read-only at Stripe, safe to re-run, owner only.
export async function POST() {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    return NextResponse.json({ success: true, data: await syncStripeLedger("full", session.name) });
  } catch (err) {
    console.error("[stripe/sync]", err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Sync failed" }, { status: 502 });
  }
}
