import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner, handleError } from "../../../_shared";
import { runPlanOnce, advanceRun, assertNotLiveInStripe } from "@/lib/invoicing/recurring";
import { InvoiceError } from "@/lib/invoicing/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST — bill this plan now (issues + emails the invoice, moves nextRunAt on)
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    const plan = await prisma.recurringPlan.findUnique({ where: { id } });
    if (!plan) throw new InvoiceError("Plan not found", 404);
    if (plan.status === "ENDED") throw new InvoiceError("This plan has ended.", 409);
    assertNotLiveInStripe(plan);
    const now = new Date();
    const runAt = plan.nextRunAt <= now ? plan.nextRunAt : now;
    const r = await runPlanOnce(plan, runAt, session.name);
    if (r.skipped) throw new InvoiceError(r.skipped, 422);
    await prisma.recurringPlan.update({
      where: { id },
      data: { lastRunAt: now, runs: { increment: 1 }, nextRunAt: plan.nextRunAt <= now ? advanceRun(plan.nextRunAt, plan.interval, plan.dayOfMonth) : plan.nextRunAt },
    });
    return NextResponse.json({ success: true, data: r });
  } catch (err) {
    return handleError(err, "Failed to run plan");
  }
}
