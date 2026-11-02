import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, handleError } from "../../_shared";
import { markPaid, markUnpaid } from "@/lib/invoicing/service";

export const dynamic = "force-dynamic";

const schema = z.object({
  paidAt: z.string().max(40).nullable().optional(),
  method: z.enum(["bank", "wise", "stripe", "paypal", "cash", "other"]).optional(),
  note: z.string().max(500).nullable().optional(),
  commissionKind: z.enum(["PROJECT", "BRAND_GUIDE", "PLAN", "NONE"]).nullable().optional(),
  sendReceipt: z.boolean().nullable().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    const body = schema.parse(await request.json().catch(() => ({})));
    const invoice = await markPaid(id, session.name, body);
    return NextResponse.json({ success: true, data: { id: invoice.id, status: invoice.status, paidAt: invoice.paidAt, paidMethod: invoice.paidMethod, commission: invoice.commission, receipt: invoice.receipt, eurAmount: invoice.eurAmount, fxRate: invoice.fxRate, fxRateDate: invoice.fxRateDate } });
  } catch (err) {
    return handleError(err, "Failed to mark paid");
  }
}

// DELETE — undo a payment that was recorded by mistake
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    const invoice = await markUnpaid(id, session.name);
    return NextResponse.json({ success: true, data: { id: invoice.id, status: invoice.status } });
  } catch (err) {
    return handleError(err, "Failed to reopen invoice");
  }
}
