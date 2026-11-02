import { NextRequest, NextResponse } from "next/server";
import { requireOwner, handleError } from "../../_shared";
import { rotateInvoiceLink } from "@/lib/invoicing/service";

export const dynamic = "force-dynamic";

// POST — replace the public token; the previous pay link dies immediately
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    const invoice = await rotateInvoiceLink(id, session.name);
    return NextResponse.json({ success: true, data: { id: invoice.id, token: invoice.token } });
  } catch (err) {
    return handleError(err, "Failed to rotate link");
  }
}
