import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireOwner, handleError } from "../../_shared";
import { InvoiceError, recordSent } from "@/lib/invoicing/service";
import { loadInvoiceSettings } from "@/lib/invoicing/settings";
import { buildInvoiceView } from "@/lib/invoicing/view";
import { renderInvoicePdf } from "@/lib/invoicing/invoice-pdf";
import { sendStudioInvoiceEmail } from "@/lib/invoicing/email";
import type { BillTo } from "@/lib/invoicing/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  to: z.string().trim().email().optional(),
  message: z.string().max(2000).optional(),
});

// POST — email the invoice (PDF attached + pay link) and mark it SENT
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    const body = schema.parse(await request.json().catch(() => ({})));
    const invoice = await prisma.studioInvoice.findUnique({ where: { id } });
    if (!invoice) throw new InvoiceError("Invoice not found", 404);
    if (!["ISSUED", "SENT", "PAID"].includes(invoice.status)) throw new InvoiceError("Issue the invoice before sending it.", 409);
    const billTo = invoice.billTo as unknown as BillTo;
    const to = body.to || billTo.email;
    if (!to) throw new InvoiceError("No email address on the invoice. Add one under Bill to, or type one here.", 422);
    if (!process.env.RESEND_API_KEY) throw new InvoiceError("Email sending is not configured (RESEND_API_KEY missing). Download the PDF and send it yourself, or copy the pay link.", 503);
    const settings = await loadInvoiceSettings();
    const view = buildInvoiceView(invoice, settings);
    const pdf = await renderInvoicePdf(view);
    let emailId: string | null = null;
    try {
      emailId = (await sendStudioInvoiceEmail({ to, view, pdf, message: body.message, replyTo: settings.email })).id;
    } catch (err) {
      throw new InvoiceError(`The email could not be sent: ${err instanceof Error ? err.message : "unknown error"}. Nothing was recorded.`, 502);
    }
    const updated = invoice.status === "PAID" ? invoice : await recordSent(id, to, emailId, session.name);
    return NextResponse.json({ success: true, data: { id: updated.id, status: updated.status, sentAt: updated.sentAt, sentTo: to } });
  } catch (err) {
    return handleError(err, "Failed to send invoice");
  }
}
