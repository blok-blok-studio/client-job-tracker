import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireOwner, handleError } from "../../_shared";
import { InvoiceError, sendIssuedInvoice } from "@/lib/invoicing/service";

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
    const invoice = await prisma.studioInvoice.findUnique({ where: { id }, select: { status: true } });
    if (!invoice) throw new InvoiceError("Invoice not found", 404);
    if (!["ISSUED", "SENT", "PAID"].includes(invoice.status)) throw new InvoiceError("Issue the invoice before sending it.", 409);
    if (!process.env.RESEND_API_KEY) throw new InvoiceError("Email sending is not configured (RESEND_API_KEY missing). Download the PDF and send it yourself, or copy the pay link.", 503);
    const result = await sendIssuedInvoice(id, session.name, body.to || null, body.message || null);
    if (!result.sent) throw new InvoiceError(result.error || "The email could not be sent.", result.to ? 502 : 422);
    return NextResponse.json({ success: true, data: { id, status: invoice.status === "PAID" ? "PAID" : "SENT", sentTo: result.to } });
  } catch (err) {
    return handleError(err, "Failed to send invoice");
  }
}
