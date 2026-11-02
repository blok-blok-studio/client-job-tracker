import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, handleError } from "../../_shared";
import { confirmMatch, ignoreTransaction, unmatchTransaction } from "@/lib/invoicing/reconcile";

export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["confirm", "ignore", "unmatch"]), invoiceId: z.string().optional() });

// PATCH — confirm a match (with an invoice id), ignore a credit, or undo
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    const body = schema.parse(await request.json());
    if (body.action === "confirm") {
      if (!body.invoiceId) return NextResponse.json({ success: false, error: "invoiceId required" }, { status: 400 });
      await confirmMatch(id, body.invoiceId, session.name);
    } else if (body.action === "ignore") await ignoreTransaction(id, session.name);
    else await unmatchTransaction(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err, "Failed to update transaction");
  }
}
