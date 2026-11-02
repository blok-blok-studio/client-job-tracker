import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { loadInvoiceSettings } from "@/lib/invoicing/settings";
import { buildInvoiceView } from "@/lib/invoicing/view";
import { renderInvoicePdf } from "@/lib/invoicing/invoice-pdf";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{16,64}$/.test(token)) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const invoice = await prisma.studioInvoice.findUnique({ where: { token } });
  if (!invoice || invoice.status === "DRAFT") return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const view = buildInvoiceView(invoice, await loadInvoiceSettings());
  const bytes = await renderInvoicePdf(view);
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${view.number}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
