import { NextRequest, NextResponse, after } from "next/server";
import { requestMeta } from "@/lib/request-meta";
import prisma from "@/lib/prisma";
import { loadInvoiceSettings } from "@/lib/invoicing/settings";
import { buildInvoiceView, publicInvoiceView } from "@/lib/invoicing/view";
import { qrDataUrl } from "@/lib/invoicing/epc-qr";

export const dynamic = "force-dynamic";

// Public, token-scoped (middleware allows /api/invoice/). Drafts are not
// viewable: the link only works once the invoice has a number.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{16,64}$/.test(token)) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const invoice = await prisma.studioInvoice.findUnique({ where: { token } });
  if (!invoice || invoice.status === "DRAFT") return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  // Who opened the pay link (evidence trail, like contract views): one row per IP per invoice per day
  after(async () => {
    const { ipAddress, userAgent } = requestMeta(request);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const details = `Pay link for ${invoice.number} opened`;
    const seen = await prisma.activityLog.findFirst({ where: { action: "invoice_viewed", details, ipAddress: ipAddress ?? undefined, createdAt: { gte: since } }, select: { id: true } }).catch(() => null);
    if (seen) return;
    await prisma.activityLog.create({ data: { clientId: invoice.clientId, actor: "client", action: "invoice_viewed", details, ipAddress, userAgent } }).catch(() => {});
  });
  const view = publicInvoiceView(buildInvoiceView(invoice, await loadInvoiceSettings(), { corrects: invoice.correctsId ? await prisma.studioInvoice.findUnique({ where: { id: invoice.correctsId }, select: { number: true, issueDate: true } }) : null }));
  const qrs = await Promise.all(view.qrs.map(async (q) => ({ kind: q.kind, dataUrl: await qrDataUrl(q.payload).catch(() => null) })));
  return NextResponse.json({ success: true, data: { ...view, qrs } }, { headers: { "Cache-Control": "no-store" } });
}
