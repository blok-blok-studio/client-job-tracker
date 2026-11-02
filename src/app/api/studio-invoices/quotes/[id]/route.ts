import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner, handleError } from "../../_shared";
import { quoteSchema, updateQuote, quoteView, InvoiceError } from "@/lib/invoicing/quotes";
import { loadInvoiceSettings } from "@/lib/invoicing/settings";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  const q = await prisma.quote.findUnique({ where: { id } });
  if (!q) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const invoices = await prisma.studioInvoice.findMany({ where: { quoteId: id }, orderBy: { createdAt: "asc" }, select: { id: true, number: true, status: true, total: true, currency: true, milestone: true } });
  return NextResponse.json({ success: true, data: { ...quoteView(q, await loadInvoiceSettings()), invoices: invoices.map((i) => ({ ...i, total: Number(i.total) })) } });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    const body = quoteSchema.partial().parse(await request.json());
    const q = await updateQuote(id, body, session.name);
    return NextResponse.json({ success: true, data: { id: q.id, total: Number(q.total), status: q.status } });
  } catch (err) {
    return handleError(err, "Failed to update quote");
  }
}

// DELETE — drafts only
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    const q = await prisma.quote.findUnique({ where: { id }, select: { status: true } });
    if (!q) throw new InvoiceError("Not found", 404);
    if (q.status !== "DRAFT") throw new InvoiceError("Only draft quotes can be deleted. Decline or let it expire instead.", 409);
    await prisma.quote.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err, "Failed to delete quote");
  }
}
