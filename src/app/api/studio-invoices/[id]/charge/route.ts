import { NextRequest, NextResponse } from "next/server";
import { requireOwner, handleError } from "../../_shared";
import { chargeInvoice } from "@/lib/invoicing/direct-debit";

export const dynamic = "force-dynamic";

// POST — collect this invoice by direct debit
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    return NextResponse.json({ success: true, data: await chargeInvoice(id, session.name) });
  } catch (err) {
    return handleError(err, "Direct debit failed");
  }
}
