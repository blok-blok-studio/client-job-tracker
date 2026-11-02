import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/app/api/studio-invoices/_shared";
import { previewPayout, recordWisePayout, PayoutError } from "@/lib/partner-payout";

export const maxDuration = 60;

// GET  — what is payable right now
// POST — record a payment already sent in Wise

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  return NextResponse.json({ success: true, data: await previewPayout(id) });
}

const schema = z.object({
  wiseTransferId: z.string().trim().min(4).max(60),
  expectedNet: z.number(),
  note: z.string().max(300).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Enter the Wise transfer ID" }, { status: 400 });
  try {
    return NextResponse.json({ success: true, data: await recordWisePayout(id, session.name, parsed.data) });
  } catch (err) {
    if (err instanceof PayoutError) return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    console.error("[partners/pay] failed:", err);
    return NextResponse.json({ success: false, error: "Could not record the payout" }, { status: 500 });
  }
}
