import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { quoteView } from "@/lib/invoicing/quotes";
import { loadInvoiceSettings } from "@/lib/invoicing/settings";

export const dynamic = "force-dynamic";

// Public, token-scoped. Drafts are not viewable.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{16,64}$/.test(token)) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const q = await prisma.quote.findUnique({ where: { token } });
  if (!q || q.status === "DRAFT") return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (q.status === "SENT" && q.validUntil < new Date()) await prisma.quote.update({ where: { id: q.id }, data: { status: "EXPIRED" } });
  const v = quoteView({ ...q, status: q.status === "SENT" && q.validUntil < new Date() ? "EXPIRED" : q.status }, await loadInvoiceSettings());
  const { id: _id, ...pub } = v;
  void _id;
  return NextResponse.json({ success: true, data: pub }, { headers: { "Cache-Control": "no-store" } });
}
