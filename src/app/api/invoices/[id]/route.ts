import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { syncEvent } from "@/lib/sync";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.status) {
      data.status = body.status;
      if (body.status === "PAID") data.paidAt = new Date();
    }
    if (body.amount !== undefined) data.amount = body.amount;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.notes !== undefined) data.notes = body.notes;

    // Fetch existing invoice to get old status for sync
    const existing = await prisma.invoice.findUnique({ where: { id }, select: { status: true, amount: true, clientId: true } });
    const invoice = await prisma.invoice.update({ where: { id }, data });

    // Sync: notify all systems on status change
    if (body.status && existing && body.status !== existing.status) {
      syncEvent({
        type: "invoice_status_changed",
        clientId: existing.clientId,
        invoiceId: id,
        amount: Number(existing.amount),
        oldStatus: existing.status,
        newStatus: body.status,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, data: invoice });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update invoice" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.invoice.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
