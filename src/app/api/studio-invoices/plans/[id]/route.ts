import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireOwner, handleError } from "../../_shared";
import { planSchema, updatePlan } from "@/lib/invoicing/recurring";

export const dynamic = "force-dynamic";

const patchSchema = planSchema.partial().extend({ status: z.enum(["ACTIVE", "PAUSED", "ENDED"]).optional(), stripeCancelled: z.boolean().optional() });

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  const plan = await prisma.recurringPlan.findUnique({ where: { id } });
  if (!plan) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const invoices = await prisma.studioInvoice.findMany({ where: { planId: id }, orderBy: { createdAt: "desc" }, take: 24, select: { id: true, number: true, status: true, total: true, currency: true, issueDate: true, dueDate: true, paidAt: true } });
  return NextResponse.json({ success: true, data: { ...plan, invoices: invoices.map((i) => ({ ...i, total: Number(i.total) })) } });
}

// PATCH — edit, pause, resume, end
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    const body = patchSchema.parse(await request.json());
    const plan = await updatePlan(id, body, session.name);
    return NextResponse.json({ success: true, data: plan });
  } catch (err) {
    return handleError(err, "Failed to update plan");
  }
}
