import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestMeta } from "@/lib/request-meta";
import { acceptQuote, InvoiceError } from "@/lib/invoicing/quotes";

export const dynamic = "force-dynamic";
const schema = z.object({ name: z.string().trim().min(2).max(120), agree: z.literal(true) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{16,64}$/.test(token)) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Type your name and tick the box" }, { status: 400 });
  try {
    const r = await acceptQuote(token, { name: parsed.data.name }, requestMeta(request));
    return NextResponse.json({ success: true, data: r });
  } catch (err) {
    if (err instanceof InvoiceError) return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    console.error("[quote/accept]", err);
    return NextResponse.json({ success: false, error: "Could not record that" }, { status: 500 });
  }
}
