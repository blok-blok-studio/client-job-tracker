import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner, handleError } from "@/app/api/studio-invoices/_shared";

export const dynamic = "force-dynamic";

// GET ?clientId= — Stripe invoices kept from the migration (no PDF bytes). Owner only.
export async function GET(request: NextRequest) {
  const { denied } = await requireOwner();
  if (denied) return denied;
  try {
    const clientId = new URL(request.url).searchParams.get("clientId");
    const docs = await prisma.stripeDocument.findMany({
      where: clientId ? { clientId } : {},
      orderBy: { issuedAt: "desc" },
      select: { id: true, number: true, status: true, currency: true, total: true, amountPaid: true, issuedAt: true, paidAt: true, customerName: true, taxYear: true, pdfBytes: true },
    });
    const counts = { total: docs.length, withPdf: docs.filter((d) => d.pdfBytes).length };
    return NextResponse.json({ success: true, data: { counts, docs: docs.map((d) => ({ ...d, total: Number(d.total), amountPaid: Number(d.amountPaid), hasPdf: !!d.pdfBytes })) } });
  } catch (err) {
    return handleError(err, "Failed to load Stripe invoices");
  }
}
