import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, handleError } from "../../_shared";
import { createCorrection } from "@/lib/invoicing/corrections";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({ reason: z.string().trim().min(3).max(300), send: z.boolean().optional() });

// POST — Stornorechnung: cancels this invoice with a numbered negative mirror
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    const { reason, send } = schema.parse(await request.json());
    const r = await createCorrection(id, reason, session.name, { send });
    return NextResponse.json({ success: true, data: { id: r.correction.id, number: r.correction.number, total: Number(r.correction.total), originalNumber: r.original.number, refundOwed: r.wasPaid, sent: r.sent } });
  } catch (err) {
    return handleError(err, "Failed to create correction");
  }
}
