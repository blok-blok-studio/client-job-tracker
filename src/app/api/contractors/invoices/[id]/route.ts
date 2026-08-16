import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { requestMeta } from "@/lib/request-meta";

const patchSchema = z.object({
  status: z.enum(["PENDING", "PAID", "DISPUTED"]).optional(),
  paymentRef: z.string().max(300).nullable().optional().or(z.literal("")),
  invoiceNumber: z.string().max(100).nullable().optional().or(z.literal("")),
  amount: z.number().nonnegative().max(1_000_000).nullable().optional(),
  currency: z.enum(["USD", "EUR", "GBP", "CHF"]).optional(),
  dueDate: z.string().nullable().optional().or(z.literal("")),
});

const invoiceInclude = {
  contractor: { select: { id: true, name: true, company: true } },
  notes: { orderBy: { createdAt: "asc" as const } },
  audits: { orderBy: { createdAt: "asc" as const } },
};

// PATCH /api/contractors/invoices/[id] — mark paid/unpaid/disputed, fix details.
// Every change is stamped into the immutable audit trail.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    const actor = session?.name || "team";
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const d = parsed.data;

    // Amounts are finances — owner-only to view or edit. Members can still
    // work statuses/refs/numbers.
    const isOwner = session?.role === "OWNER";
    if (!isOwner) delete d.amount;

    const existing = await prisma.contractorInvoice.findUnique({
      where: { id },
      include: { contractor: { select: { name: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
    }

    const { ipAddress, userAgent } = requestMeta(request);
    const auditEvents: { event: string; metadata: string }[] = [];

    const statusChanged = d.status !== undefined && d.status !== existing.status;
    if (statusChanged) {
      const event =
        d.status === "PAID" ? "marked_paid" : d.status === "DISPUTED" ? "disputed" : "marked_unpaid";
      auditEvents.push({
        event,
        metadata: JSON.stringify({ from: existing.status, to: d.status }),
      });
    }

    const detailChanges: Record<string, { from: unknown; to: unknown }> = {};
    if (d.invoiceNumber !== undefined && (d.invoiceNumber || null) !== existing.invoiceNumber)
      detailChanges.invoiceNumber = { from: existing.invoiceNumber, to: d.invoiceNumber || null };
    if (d.amount !== undefined && String(d.amount ?? "") !== String(existing.amount ?? ""))
      detailChanges.amount = { from: existing.amount, to: d.amount };
    if (d.currency !== undefined && d.currency !== existing.currency)
      detailChanges.currency = { from: existing.currency, to: d.currency };
    if (d.paymentRef !== undefined && (d.paymentRef || null) !== existing.paymentRef)
      detailChanges.paymentRef = { from: existing.paymentRef, to: d.paymentRef || null };
    if (Object.keys(detailChanges).length > 0) {
      auditEvents.push({ event: "details_edited", metadata: JSON.stringify(detailChanges) });
    }

    const invoice = await prisma.contractorInvoice.update({
      where: { id },
      data: {
        ...(d.status !== undefined && {
          status: d.status,
          // paidAt/paidBy are the legal payment stamp — set once when marked
          // paid, cleared if payment is undone
          ...(statusChanged && d.status === "PAID" && { paidAt: new Date(), paidBy: actor }),
          ...(statusChanged && d.status !== "PAID" && { paidAt: null, paidBy: null }),
        }),
        ...(d.paymentRef !== undefined && { paymentRef: d.paymentRef || null }),
        ...(d.invoiceNumber !== undefined && { invoiceNumber: d.invoiceNumber || null }),
        ...(d.amount !== undefined && { amount: d.amount }),
        ...(d.currency !== undefined && { currency: d.currency }),
        ...(d.dueDate !== undefined && { dueDate: d.dueDate ? new Date(d.dueDate) : null }),
        audits: {
          create: auditEvents.map((a) => ({ ...a, actor, ipAddress, userAgent })),
        },
      },
      include: invoiceInclude,
    });

    if (statusChanged) {
      await prisma.activityLog.create({
        data: {
          actor,
          action: `contractor_invoice_${d.status === "PAID" ? "paid" : d.status === "DISPUTED" ? "disputed" : "unpaid"}`,
          details: `${existing.contractor.name} invoice ${existing.invoiceNumber || existing.filename} → ${d.status}`,
          ipAddress,
          userAgent,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: isOwner ? invoice : { ...invoice, amount: null, scannedAmount: null },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to update invoice" }, { status: 500 });
  }
}
