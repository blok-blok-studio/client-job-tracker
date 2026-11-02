import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, handleError } from "../../_shared";
import { voidInvoice } from "@/lib/invoicing/service";

export const dynamic = "force-dynamic";

const schema = z.object({ reason: z.string().trim().min(3).max(500) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    const { reason } = schema.parse(await request.json());
    const invoice = await voidInvoice(id, session.name, reason);
    return NextResponse.json({ success: true, data: { id: invoice.id, status: invoice.status, voidedAt: invoice.voidedAt } });
  } catch (err) {
    return handleError(err, "Failed to void invoice");
  }
}
