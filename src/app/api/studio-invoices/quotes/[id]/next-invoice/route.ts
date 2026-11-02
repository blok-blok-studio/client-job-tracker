import { NextRequest, NextResponse } from "next/server";
import { requireOwner, handleError } from "../../../_shared";
import { createNextMilestoneInvoice } from "@/lib/invoicing/quotes";

export const dynamic = "force-dynamic";

// POST — draft the next milestone invoice of an accepted quote (deposit, then balance, …)
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    const inv = await createNextMilestoneInvoice(id, session.name);
    return NextResponse.json({ success: true, data: { id: inv.id, milestoneLabel: inv.milestoneLabel, milestoneIndex: inv.milestoneIndex, milestones: inv.milestones, total: Number(inv.total) } });
  } catch (err) {
    return handleError(err, "Failed to create the invoice");
  }
}
