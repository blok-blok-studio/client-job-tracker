import { NextRequest, NextResponse } from "next/server";
import { requireOwner, handleError } from "../../_shared";
import { issueInvoice } from "@/lib/invoicing/service";
import { requestMeta } from "@/lib/request-meta";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    const invoice = await issueInvoice(id, session.name, requestMeta(request));
    return NextResponse.json({ success: true, data: { id: invoice.id, number: invoice.number, status: invoice.status, token: invoice.token, total: Number(invoice.total) } });
  } catch (err) {
    return handleError(err, "Failed to issue invoice");
  }
}
