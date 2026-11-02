import { NextRequest, NextResponse } from "next/server";
import { requireOwner, handleError } from "@/app/api/studio-invoices/_shared";
import { removeMandate } from "@/lib/invoicing/direct-debit";

export const dynamic = "force-dynamic";

// DELETE — remove the client's direct debit mandate
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    await removeMandate(id, session.name);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err, "Failed to remove the mandate");
  }
}
