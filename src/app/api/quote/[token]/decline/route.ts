import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestMeta } from "@/lib/request-meta";
import { declineQuote, InvoiceError } from "@/lib/invoicing/quotes";

export const dynamic = "force-dynamic";
const schema = z.object({ reason: z.string().max(300).nullable().optional() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{16,64}$/.test(token)) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  try {
    const r = await declineQuote(token, parsed.success ? parsed.data.reason || null : null, requestMeta(request));
    return NextResponse.json({ success: true, data: r });
  } catch (err) {
    if (err instanceof InvoiceError) return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    return NextResponse.json({ success: false, error: "Could not record that" }, { status: 500 });
  }
}
