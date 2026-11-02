import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner, handleError } from "../_shared";

export const dynamic = "force-dynamic";

// GET ?status= — imported bank credits with their match state
export async function GET(request: NextRequest) {
  const { denied } = await requireOwner();
  if (denied) return denied;
  try {
    const status = new URL(request.url).searchParams.get("status");
    const rows = await prisma.bankTransaction.findMany({
      where: status && status !== "all" ? { status } : {},
      orderBy: [{ bookedAt: "desc" }],
      take: 300,
    });
    const ids = [...new Set(rows.flatMap((r) => [r.invoiceId, r.suggestedInvoiceId]).filter((x): x is string => !!x))];
    const invs = ids.length ? await prisma.studioInvoice.findMany({ where: { id: { in: ids } }, select: { id: true, number: true, total: true, currency: true, status: true, client: { select: { name: true, company: true } } } }) : [];
    const byId = new Map(invs.map((i) => [i.id, { ...i, total: Number(i.total) }]));
    const open = await prisma.studioInvoice.findMany({ where: { status: { in: ["ISSUED", "SENT"] } }, select: { id: true, number: true, total: true, currency: true, client: { select: { name: true, company: true } } }, orderBy: { issueDate: "desc" } });
    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({ ...r, amount: Number(r.amount), invoice: r.invoiceId ? byId.get(r.invoiceId) || null : null, suggested: r.suggestedInvoiceId ? byId.get(r.suggestedInvoiceId) || null : null })),
      openInvoices: open.map((i) => ({ ...i, total: Number(i.total) })),
      counts: {
        unmatched: await prisma.bankTransaction.count({ where: { status: "UNMATCHED" } }),
        suggested: await prisma.bankTransaction.count({ where: { status: "SUGGESTED" } }),
      },
    });
  } catch (err) {
    return handleError(err, "Failed to load bank transactions");
  }
}
