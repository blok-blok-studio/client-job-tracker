import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner, handleError } from "../../_shared";
import { loadInvoiceSettings } from "@/lib/invoicing/settings";
import { buildInvoiceView } from "@/lib/invoicing/view";
import { renderInvoicePdf } from "@/lib/invoicing/invoice-pdf";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireOwner();
  if (denied) return denied;
  try {
    const { id } = await params;
    const invoice = await prisma.studioInvoice.findUnique({ where: { id } });
    if (!invoice) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    const view = buildInvoiceView(invoice, await loadInvoiceSettings());
    const bytes = await renderInvoicePdf(view);
    const inline = new URL(request.url).searchParams.get("inline") === "1";
    const name = `${view.number || "draft"}.pdf`;
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleError(err, "Failed to render PDF");
  }
}
