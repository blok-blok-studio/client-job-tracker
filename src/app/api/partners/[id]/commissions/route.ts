import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { partnerLedgerTotals } from "@/lib/commissions";
import { partnerLedgerRows } from "@/lib/partner-portal";

// GET  — the partner's ledger (owner view, amounts included)
// POST — manual adjustment: a bonus, a correction, or a clawback (negative)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }
  const { id } = await params;
  const status = new URL(request.url).searchParams.get("status");
  const filter = status === "PAYABLE" || status === "PAID" || status === "VOID" ? status : null;

  const [rows, totals] = await Promise.all([partnerLedgerRows(id, filter), partnerLedgerTotals(id)]);
  return NextResponse.json({ success: true, data: { rows, totals } });
}

const adjustSchema = z.object({
  clientId: z.string().min(1),
  amount: z.number().refine((v) => Math.abs(v) >= 0.01 && Math.abs(v) <= 100000, "Amount out of range"),
  description: z.string().min(1).max(300),
  reversesId: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }
  const { id } = await params;
  const parsed = adjustSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;

  const client = await prisma.client.findFirst({
    where: { id: d.clientId, partnerId: id },
    select: { id: true, name: true, partnerRepId: true, closedBy: true },
  });
  if (!client) {
    return NextResponse.json({ success: false, error: "That client is not attributed to this partner" }, { status: 404 });
  }

  const amount = Math.round(d.amount * 100) / 100;
  const row = await prisma.commission.create({
    data: {
      partnerId: id,
      partnerRepId: client.partnerRepId,
      clientId: client.id,
      kind: "ADJUSTMENT",
      description: d.description.trim(),
      basisAmount: Math.abs(amount),
      rate: 100,
      amount,
      closedBy: client.closedBy,
      eventAt: new Date(),
      payableBy: amount > 0 ? new Date() : null,
      reversesId: d.reversesId || null,
      createdBy: session.name,
    },
  });

  await prisma.activityLog.create({
    data: {
      clientId: client.id,
      actor: session.name,
      action: "commission_adjusted",
      details: `Manual commission adjustment for ${client.name}: ${d.description.trim()}`,
    },
  });

  return NextResponse.json({ success: true, data: { id: row.id } });
}

// DELETE ?rowId= — void an unpaid row (paid rows are permanent)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }
  const { id } = await params;
  const rowId = new URL(request.url).searchParams.get("rowId");
  if (!rowId) {
    return NextResponse.json({ success: false, error: "rowId required" }, { status: 400 });
  }
  const row = await prisma.commission.findFirst({ where: { id: rowId, partnerId: id } });
  if (!row) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  if (row.status === "PAID") {
    return NextResponse.json({ success: false, error: "Paid rows are permanent. Add a negative adjustment instead." }, { status: 400 });
  }
  await prisma.commission.update({ where: { id: row.id }, data: { status: "VOID" } });
  await prisma.activityLog.create({
    data: { clientId: row.clientId, actor: session.name, action: "commission_voided", details: `Voided: ${row.description}` },
  });
  return NextResponse.json({ success: true });
}
