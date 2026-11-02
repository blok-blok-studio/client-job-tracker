import { NextRequest, NextResponse } from "next/server";
import { startMandate } from "@/lib/invoicing/direct-debit";
import { InvoiceError } from "@/lib/invoicing/service";

export const dynamic = "force-dynamic";

// POST — send the client to Stripe's mandate page
export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{16,64}$/.test(token)) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  try {
    return NextResponse.json({ success: true, data: { url: await startMandate(token) } });
  } catch (err) {
    if (err instanceof InvoiceError) return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    console.error("[invoice/debit]", err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: "Direct debit is not available right now." }, { status: 502 });
  }
}
