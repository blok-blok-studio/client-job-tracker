import { Resend } from "resend";
import type { InvoiceView } from "./types";
import { formatDate, formatMoney } from "./money";

const FROM_EMAIL = "Blok Blok Studio <chase@blokblokstudio.com>";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Emails the invoice to the client: PDF attached, link to the pay page with
 * the QR code. Plain, black and white, matches the invoice. Fails loudly when
 * RESEND_API_KEY is missing so nothing reports a phantom send.
 */
export async function sendStudioInvoiceEmail(params: {
  to: string;
  view: InvoiceView;
  pdf: Uint8Array;
  message?: string | null;
  replyTo?: string | null;
}): Promise<{ id: string | null }> {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set, invoice email not sent");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const v = params.view;
  const de = v.language === "de";
  const amount = formatMoney(v.total, v.currency, v.language);
  const due = v.dueDate ? formatDate(v.dueDate, v.language) : null;
  const first = (v.billTo.name || "").split(" ")[0] || "";
  const number = v.number || "";

  const subject = de ? `Rechnung ${number} von Blok Blok Studio` : `Invoice ${number} from Blok Blok Studio`;
  const greeting = de ? `Hallo ${first},` : `Hi ${first},`;
  const intro = de
    ? `anbei erhalten Sie die Rechnung <strong>${esc(number)}</strong> über <strong>${esc(amount)}</strong>${due ? `, fällig am <strong>${esc(due)}</strong>` : ""}.`
    : `please find attached invoice <strong>${esc(number)}</strong> for <strong>${esc(amount)}</strong>${due ? `, due <strong>${esc(due)}</strong>` : ""}.`;
  const payLine =
    v.paymentMethod === "STRIPE"
      ? de
        ? "Sie können bequem per Karte über den Link auf der Rechnung bezahlen."
        : "You can pay by card using the link on the invoice."
      : v.currency === "EUR"
        ? de
          ? "Bezahlen Sie per Überweisung. Den GiroCode auf der Rechnung können Sie direkt mit Ihrer Banking-App scannen, die Überweisung ist dann vorausgefüllt."
          : "Please pay by bank transfer. The QR code on the invoice can be scanned with a European banking app to pre-fill the transfer."
        : de
          ? "Bezahlen Sie per Überweisung (ACH oder Wire) an die auf der Rechnung angegebene Bankverbindung."
          : "Please pay by bank transfer (ACH or wire) to the account details on the invoice.";
  const refLine = de
    ? `Bitte geben Sie als Verwendungszweck <strong>${esc(number)}</strong> an.`
    : `Please use <strong>${esc(number)}</strong> as the payment reference.`;
  const button = de ? "Rechnung online ansehen" : "View invoice online";
  const closing = de ? "Vielen Dank und beste Grüße" : "Thank you and best regards";
  const custom = params.message?.trim() ? `<p style="color:#333;font-size:15px;line-height:1.6;white-space:pre-wrap;">${esc(params.message.trim())}</p>` : "";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;color:#111;">
      <div style="margin-bottom:28px;">
        <h2 style="margin:0;font-size:18px;letter-spacing:0.02em;">Blok Blok Studio</h2>
      </div>
      <p style="font-size:15px;line-height:1.6;">${esc(greeting)}</p>
      <p style="font-size:15px;line-height:1.6;">${intro}</p>
      ${custom}
      <p style="font-size:15px;line-height:1.6;">${payLine}<br/>${refLine}</p>
      <div style="margin:28px 0;">
        <a href="${esc(v.publicUrl)}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">${esc(button)}</a>
      </div>
      <p style="font-size:15px;line-height:1.6;">${esc(closing)}<br/>${esc(v.seller.contactName)}</p>
      <hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0;"/>
      <p style="color:#777;font-size:12px;line-height:1.6;">
        ${esc(v.seller.sellerName)} · ${esc(v.seller.addressLines.join(", "))}<br/>
        ${v.seller.steuernummer ? `${de ? "Steuernummer" : "Tax number"} ${esc(v.seller.steuernummer)} · ` : ""}${esc(v.seller.email)} · ${esc(v.seller.website)}
      </p>
    </div>`;

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: params.to,
    replyTo: params.replyTo || v.seller.email || undefined,
    subject,
    html,
    attachments: [{ filename: `${number || "invoice"}.pdf`, content: Buffer.from(params.pdf) }],
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
  return { id: data?.id ?? null };
}
