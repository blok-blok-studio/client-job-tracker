import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { loadInvoiceSettings } from "@/lib/invoicing/settings";
import { buildInvoiceView, publicInvoiceView } from "@/lib/invoicing/view";
import { qrDataUrl } from "@/lib/invoicing/epc-qr";

export const dynamic = "force-dynamic";

// Public, token-scoped (middleware allows /api/invoice/). Drafts are not
// viewable: the link only works once the invoice has a number.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{16,64}$/.test(token)) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const invoice = await prisma.studioInvoice.findUnique({ where: { token } });
  if (!invoice || invoice.status === "DRAFT") return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const view = buildInvoiceView(invoice, await loadInvoiceSettings());
  const qr = view.qrPayload ? await qrDataUrl(view.qrPayload).catch(() => null) : null;
  return NextResponse.json({ success: true, data: { ...publicInvoiceView(view), qrDataUrl: qr } }, { headers: { "Cache-Control": "no-store" } });
}
