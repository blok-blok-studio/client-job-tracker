import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { previewPayout, runPayout, PayoutError } from "@/lib/partner-payout";

export const maxDuration = 120;

// GET  — what a payout run would send right now
// POST — send it (one Stripe Connect transfer for the net)

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }
  const { id } = await params;
  const preview = await previewPayout(id);
  return NextResponse.json({ success: true, data: preview });
}

const schema = z.object({ note: z.string().max(300).optional() });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  try {
    const result = await runPayout(id, session.name, parsed.success ? parsed.data.note : undefined);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof PayoutError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    console.error("[partners/pay] failed:", err);
    return NextResponse.json({ success: false, error: "Payout failed" }, { status: 500 });
  }
}
