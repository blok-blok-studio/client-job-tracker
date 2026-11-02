import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner, handleError } from "../_shared";
import { createPlan, planSchema } from "@/lib/invoicing/recurring";

export const dynamic = "force-dynamic";

function shape(p: { id: string; clientId: string; name: string; status: string; interval: string; dayOfMonth: number; startDate: Date; endDate: Date | null; nextRunAt: Date; lastRunAt: Date | null; runs: number; template: string; language: string; currency: string; vatOverride: string | null; dueDays: number; items: unknown; notes: string | null; autoSend: boolean; paymentMethod: string; paymentUrl: string | null; createdAt: Date }, client: { id: string; name: string; company: string | null } | undefined) {
  const items = (p.items as Array<{ description: string; qty: number; unitPrice: number }>) || [];
  return {
    ...p,
    items,
    amount: Math.round(items.reduce((s, i) => s + Number(i.qty) * Number(i.unitPrice), 0) * 100) / 100,
    client: client || { id: p.clientId, name: "Unknown", company: null },
  };
}

// GET — every recurring plan (owner)
export async function GET() {
  const { denied } = await requireOwner();
  if (denied) return denied;
  try {
    const plans = await prisma.recurringPlan.findMany({ orderBy: [{ status: "asc" }, { nextRunAt: "asc" }] });
    const clients = await prisma.client.findMany({ where: { id: { in: [...new Set(plans.map((p) => p.clientId))] } }, select: { id: true, name: true, company: true } });
    const byId = new Map(clients.map((c) => [c.id, c]));
    return NextResponse.json({ success: true, data: plans.map((p) => shape(p, byId.get(p.clientId))) });
  } catch (err) {
    return handleError(err, "Failed to load plans");
  }
}

// POST — new plan
export async function POST(request: NextRequest) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const body = planSchema.parse(await request.json());
    const plan = await createPlan(body, session.name);
    const client = await prisma.client.findUnique({ where: { id: plan.clientId }, select: { id: true, name: true, company: true } });
    return NextResponse.json({ success: true, data: shape(plan, client || undefined) }, { status: 201 });
  } catch (err) {
    return handleError(err, "Failed to create plan");
  }
}
