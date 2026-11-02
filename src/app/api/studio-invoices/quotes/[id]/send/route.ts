import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import prisma from "@/lib/prisma";
import { requireOwner, handleError } from "../../../_shared";
import { quoteView, renderQuotePdf, InvoiceError } from "@/lib/invoicing/quotes";
import { loadInvoiceSettings } from "@/lib/invoicing/settings";
import { formatDate, formatMoney } from "@/lib/invoicing/money";
import type { BillTo } from "@/lib/invoicing/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({ to: z.string().trim().email().optional(), message: z.string().max(2000).optional() });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// POST — email the quote (PDF + accept link) and mark it SENT
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    const body = schema.parse(await request.json().catch(() => ({})));
    const q = await prisma.quote.findUnique({ where: { id } });
    if (!q) throw new InvoiceError("Quote not found", 404);
    const to = body.to || (q.billTo as unknown as BillTo).email;
    if (!to) throw new InvoiceError("No email on the quote.", 422);
    if (!process.env.RESEND_API_KEY) throw new InvoiceError("Email sending is not configured (RESEND_API_KEY missing). Copy the link instead.", 503);
    const settings = await loadInvoiceSettings();
    const v = quoteView(q, settings);
    const pdf = await renderQuotePdf(q);
    const de = v.language === "de";
    const first = (v.billTo.name || "").split(" ")[0] || "";
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;color:#111;">
        <img src="https://app.blokblokstudio.com/bb_logo_wordmark_subhead_BLK_PNG.png" alt="Blok Blok Studio" width="170" style="display:block;width:170px;height:auto;margin:0 0 28px;border:0;" />
        <p style="font-size:15px;line-height:1.6;">${esc(de ? `Hallo ${first},` : `Hi ${first},`)}</p>
        <p style="font-size:15px;line-height:1.6;">${de ? `anbei unser Angebot <strong>${esc(v.number || "")}</strong> über <strong>${esc(formatMoney(v.total, v.currency, "de"))}</strong>, gültig bis ${esc(formatDate(v.validUntil, "de"))}.` : `please find our quote <strong>${esc(v.number || "")}</strong> for <strong>${esc(formatMoney(v.total, v.currency, "en"))}</strong>, valid until ${esc(formatDate(v.validUntil, "en"))}.`}</p>
        ${body.message ? `<p style="font-size:15px;line-height:1.6;white-space:pre-wrap;">${esc(body.message)}</p>` : ""}
        <p style="font-size:15px;line-height:1.6;">${de ? "Sie können das Angebot online ansehen und mit einem Klick annehmen:" : "You can review and accept it online with one click:"}</p>
        <div style="margin:24px 0;"><a href="${esc(v.acceptUrl)}" style="display:inline-block;background:#2561D8;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">${de ? "Angebot ansehen" : "View quote"}</a></div>
        <p style="font-size:15px;line-height:1.6;">${esc(de ? "Beste Grüße" : "Best regards")}<br/>${esc(v.seller.contactName)}</p>
      </div>`;
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({ from: "Blok Blok Studio <chase@blokblokstudio.com>", to, replyTo: settings.email || undefined, subject: de ? `Angebot ${v.number} von Blok Blok Studio` : `Quote ${v.number} from Blok Blok Studio`, html, attachments: [{ filename: `${v.number}.pdf`, content: Buffer.from(pdf) }] });
    if (error) throw new InvoiceError(`Email failed: ${error.message}`, 502);
    await prisma.quote.update({ where: { id }, data: { status: q.status === "DRAFT" ? "SENT" : q.status, sentAt: new Date() } });
    await prisma.activityLog.create({ data: { clientId: q.clientId, actor: session.name, action: "quote_sent", details: `Quote ${q.number} emailed to ${to}` } }).catch(() => {});
    return NextResponse.json({ success: true, data: { sentTo: to } });
  } catch (err) {
    return handleError(err, "Failed to send quote");
  }
}
