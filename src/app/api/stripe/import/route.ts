import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, handleError } from "@/app/api/studio-invoices/_shared";
import { importStripeHistory } from "@/lib/invoicing/stripe-import";

export const maxDuration = 300;

const schema = z.object({ text: z.string().min(10).max(2_000_000) });

// POST { text } — one-time import of Stripe payment history. Owner only, no Stripe connection.
export async function POST(request: NextRequest) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { text } = schema.parse(await request.json());
    return NextResponse.json({ success: true, data: await importStripeHistory(text, session.name) });
  } catch (err) {
    return handleError(err, "Import failed");
  }
}
