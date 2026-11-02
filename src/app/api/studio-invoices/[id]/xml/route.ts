import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner, handleError } from "../../_shared";
import { loadInvoiceSettings } from "@/lib/invoicing/settings";
import { buildInvoiceView } from "@/lib/invoicing/view";
import { buildCiiXml } from "@/lib/invoicing/einvoice";

export const dynamic = "force-dynamic";

// GET — the invoice as EN 16931 CII XML
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireOwner();
  if (denied) return denied;
  try {
    const { id } = await params;
    const inv = await prisma.studioInvoice.findUnique({ where: { id } });
    if (!inv || inv.status === "DRAFT") return NextResponse.json({ success: false, error: "Issue the invoice first" }, { status: 404 });
    const xml = buildCiiXml(buildInvoiceView(inv, await loadInvoiceSettings()));
    return new NextResponse(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${inv.number}.xml"`, "Cache-Control": "no-store" } });
  } catch (err) {
    return handleError(err, "Failed to build the XML");
  }
}
