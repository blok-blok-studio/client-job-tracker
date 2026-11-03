import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, handleError } from "@/app/api/studio-invoices/_shared";
import { importStripeLedger } from "@/lib/invoicing/stripe-ledger-import";

export const maxDuration = 300;

const schema = z.object({ text: z.string().min(20).max(4_000_000) });

// POST { text } — Stripe's balance history CSV, imported once. Owner only, no Stripe connection.
export async function POST(request: NextRequest) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { text } = schema.parse(await request.json());
    return NextResponse.json({ success: true, data: await importStripeLedger(text, session.name) });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("This is not Stripe")) return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    return handleError(err, "Import failed");
  }
}
