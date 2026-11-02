import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestMeta } from "@/lib/request-meta";
import { reportPayment, InvoiceError } from "@/lib/invoicing/service";

export const dynamic = "force-dynamic";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().max(200).nullable().optional(),
});

// POST — the client says "I have paid". Public, token-scoped, rate-limited by
// the middleware. Nothing is marked paid here: the owner confirms it.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{16,64}$/.test(token)) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Check the date" }, { status: 400 });
  try {
    const result = await reportPayment(token, parsed.data, requestMeta(request));
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof InvoiceError) return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    console.error("[invoice/paid]", err);
    return NextResponse.json({ success: false, error: "Could not record that" }, { status: 500 });
  }
}
