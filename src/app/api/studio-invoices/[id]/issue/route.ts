import { NextRequest, NextResponse } from "next/server";
import { requireOwner, handleError } from "../../_shared";
import { issueInvoice, sendIssuedInvoice } from "@/lib/invoicing/service";
import { loadInvoiceSettings } from "@/lib/invoicing/settings";
import { requestMeta } from "@/lib/request-meta";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    const invoice = await issueInvoice(id, session.name, requestMeta(request));
    const body = await request.json().catch(() => ({}));
    const settings = await loadInvoiceSettings();
    const wantSend = typeof body?.send === "boolean" ? body.send : settings.autoSendOnIssue;
    const send = wantSend ? await sendIssuedInvoice(id, session.name, null, null) : { sent: false, to: null, error: null };
    return NextResponse.json({ success: true, data: { id: invoice.id, number: invoice.number, status: send.sent ? "SENT" : invoice.status, token: invoice.token, total: Number(invoice.total), send } });
  } catch (err) {
    return handleError(err, "Failed to issue invoice");
  }
}
