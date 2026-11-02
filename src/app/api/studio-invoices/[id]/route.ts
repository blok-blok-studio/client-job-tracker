import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner, handleError } from "../_shared";
import { deleteDraft, draftSchema, updateDraft, InvoiceError, integrityOf } from "@/lib/invoicing/service";
import { loadInvoiceSettings } from "@/lib/invoicing/settings";
import { buildInvoiceView } from "@/lib/invoicing/view";
import { qrDataUrl } from "@/lib/invoicing/epc-qr";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { denied } = await requireOwner();
  if (denied) return denied;
  try {
    const { id } = await params;
    const invoice = await prisma.studioInvoice.findUnique({ where: { id }, include: { client: { select: { id: true, name: true, company: true, email: true } } } });
    if (!invoice) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    const settings = await loadInvoiceSettings();
    const view = buildInvoiceView(invoice, settings);
    const qr = view.qrPayload ? await qrDataUrl(view.qrPayload).catch(() => null) : null;
    const activity = await prisma.activityLog.findMany({
      where: { clientId: invoice.clientId, action: { startsWith: "invoice_" }, details: invoice.number ? { contains: invoice.number } : undefined },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, action: true, actor: true, details: true, createdAt: true },
    });
    return NextResponse.json({ success: true, data: { ...view, client: invoice.client, internalNote: invoice.internalNote, qrDataUrl: qr, activity, contentHash: invoice.contentHash, integrity: integrityOf(invoice) } });
  } catch (err) {
    return handleError(err, "Failed to load invoice");
  }
}

// PATCH — edit a draft (full recompute) or, on an issued invoice, just the internal note
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    const body = await request.json();
    const existing = await prisma.studioInvoice.findUnique({ where: { id }, select: { status: true, clientId: true } });
    if (!existing) throw new InvoiceError("Invoice not found", 404);
    if (existing.status !== "DRAFT") {
      const note = typeof body?.internalNote === "string" ? body.internalNote.slice(0, 2000) : null;
      if (note === null && !("internalNote" in (body || {}))) throw new InvoiceError("Only the internal note can change after issuing.", 409);
      const invoice = await prisma.studioInvoice.update({ where: { id }, data: { internalNote: note || null } });
      return NextResponse.json({ success: true, data: { id: invoice.id, internalNote: invoice.internalNote } });
    }
    const parsed = draftSchema.parse({ ...body, clientId: existing.clientId });
    const { invoice, warning } = await updateDraft(id, parsed, session.name);
    return NextResponse.json({ success: true, data: { id: invoice.id, status: invoice.status, total: Number(invoice.total) }, warning });
  } catch (err) {
    return handleError(err, "Failed to update invoice");
  }
}

// DELETE — drafts only. Issued invoices are permanent; void them.
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    await deleteDraft(id, session.name);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err, "Failed to delete draft");
  }
}
