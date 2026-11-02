import { Resend } from "resend";
import prisma from "@/lib/prisma";
import { loadInvoiceSettings } from "./settings";
import { buildInvoiceView } from "./view";
import { formatDate, formatMoney } from "./money";
import type { BillTo } from "./types";
import { logInvoiceActivity } from "./service";
import { notifyUser } from "@/lib/notifications";
import { notifySlack } from "@/lib/slack";

/**
 * Dunning. Stages per invoice:
 *  1  due soon (beforeDueDays before the due date)
 *  2+ overdue reminders on settings.reminders.overdueDays after the due date;
 *     the last configured day is the final notice (Mahnung) and pings the owner.
 * Skipped when the client already pressed "I have paid" (the owner gets a
 * nudge to confirm instead). Every send is one activity row; never twice.
 */
const FROM_EMAIL = "Blok Blok Studio <chase@blokblokstudio.com>";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Stage = { stage: number; kind: "due_soon" | "overdue" | "final" };

export function stageDue(now: Date, dueDate: Date, current: number, cfg: { beforeDueDays: number; overdueDays: number[] }): Stage | null {
  const day = 86_400_000;
  const overdueDays = cfg.overdueDays;
  // stage numbers: 1 = due soon, 2.. = overdue entries in order
  const diff = now.getTime() - dueDate.getTime(); // >0 overdue
  for (let i = overdueDays.length - 1; i >= 0; i--) {
    const stage = i + 2;
    if (diff >= overdueDays[i] * day && current < stage) return { stage, kind: i === overdueDays.length - 1 ? "final" : "overdue" };
  }
  if (current < 1 && cfg.beforeDueDays > 0 && diff >= -cfg.beforeDueDays * day && diff < 0) return { stage: 1, kind: "due_soon" };
  return null;
}

function subjectAndBody(kind: Stage["kind"], v: ReturnType<typeof buildInvoiceView>) {
  const de = v.language === "de";
  const amount = formatMoney(v.total, v.currency, v.language);
  const due = v.dueDate ? formatDate(v.dueDate, v.language) : "";
  const n = v.number || "";
  if (kind === "due_soon") {
    return {
      subject: de ? `Erinnerung: Rechnung ${n} ist am ${due} fällig` : `Reminder: invoice ${n} is due on ${due}`,
      body: de
        ? `eine kurze Erinnerung: die Rechnung <strong>${esc(n)}</strong> über <strong>${esc(amount)}</strong> ist am <strong>${esc(due)}</strong> fällig. Falls die Zahlung schon unterwegs ist, betrachten Sie diese Nachricht bitte als gegenstandslos.`
        : `a quick reminder that invoice <strong>${esc(n)}</strong> for <strong>${esc(amount)}</strong> is due on <strong>${esc(due)}</strong>. If the payment is already on its way, please ignore this note.`,
    };
  }
  if (kind === "overdue") {
    return {
      subject: de ? `Zahlungserinnerung: Rechnung ${n}` : `Payment reminder: invoice ${n}`,
      body: de
        ? `die Rechnung <strong>${esc(n)}</strong> über <strong>${esc(amount)}</strong> war am <strong>${esc(due)}</strong> fällig und ist bei uns noch nicht eingegangen. Bitte überweisen Sie den Betrag in den nächsten Tagen. Sollte sich die Zahlung mit dieser E-Mail überschnitten haben, danken wir Ihnen.`
        : `invoice <strong>${esc(n)}</strong> for <strong>${esc(amount)}</strong> was due on <strong>${esc(due)}</strong> and has not reached us yet. Please arrange the transfer in the next few days. If it has crossed with this email, thank you.`,
    };
  }
  return {
    subject: de ? `Mahnung: Rechnung ${n}` : `Final notice: invoice ${n}`,
    body: de
      ? `trotz Erinnerung ist die Rechnung <strong>${esc(n)}</strong> über <strong>${esc(amount)}</strong> (fällig am ${esc(due)}) weiterhin offen. Wir bitten um Ausgleich innerhalb von 7 Tagen. Danach behalten wir uns vor, Verzugszinsen und Mahnkosten gemäß § 288 BGB zu berechnen und die Arbeit für Sie zu pausieren.`
      : `despite our reminder, invoice <strong>${esc(n)}</strong> for <strong>${esc(amount)}</strong> (due ${esc(due)}) is still outstanding. Please settle it within 7 days. After that we may charge statutory late interest and pause work on your account.`,
  };
}

async function sendReminderEmail(kind: Stage["kind"], v: ReturnType<typeof buildInvoiceView>, to: string): Promise<string | null> {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const de = v.language === "de";
  const { subject, body } = subjectAndBody(kind, v);
  const first = (v.billTo.name || "").split(" ")[0] || "";
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;color:#111;">
      <h2 style="margin:0 0 28px;font-size:18px;letter-spacing:0.02em;">Blok Blok Studio</h2>
      <p style="font-size:15px;line-height:1.6;">${esc(de ? `Hallo ${first},` : `Hi ${first},`)}</p>
      <p style="font-size:15px;line-height:1.6;">${body}</p>
      <p style="font-size:15px;line-height:1.6;">${de ? `Verwendungszweck: <strong>${esc(v.number || "")}</strong>. Alle Zahlungsdetails, der GiroCode und das PDF:` : `Payment reference: <strong>${esc(v.number || "")}</strong>. Bank details, QR code and PDF:`}</p>
      <div style="margin:24px 0;"><a href="${esc(v.publicUrl)}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">${de ? "Rechnung öffnen" : "Open invoice"}</a></div>
      <p style="font-size:15px;line-height:1.6;">${esc(de ? "Beste Grüße" : "Best regards")}<br/>${esc(v.seller.contactName)}</p>
      <hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0;"/>
      <p style="color:#777;font-size:12px;line-height:1.6;">${esc(v.seller.sellerName)} · ${esc(v.seller.addressLines.join(", "))} · ${esc(v.seller.email)}</p>
    </div>`;
  const { data, error } = await resend.emails.send({ from: FROM_EMAIL, to, replyTo: v.seller.email || undefined, subject, html });
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

export async function runPaymentReminders(now = new Date()): Promise<Array<{ number: string | null; stage: number; result: string }>> {
  const settings = await loadInvoiceSettings();
  if (!settings.reminders.enabled) return [];
  const open = await prisma.studioInvoice.findMany({
    where: { status: { in: ["ISSUED", "SENT"] }, dueDate: { not: null } },
    orderBy: { dueDate: "asc" },
    take: 200,
  });
  const owners = await prisma.user.findMany({ where: { role: "OWNER", isActive: true }, select: { id: true } });
  const out: Array<{ number: string | null; stage: number; result: string }> = [];
  for (const inv of open) {
    if (inv.debitStatus === "PROCESSING") continue; // money is on its way
    const next = stageDue(now, inv.dueDate!, inv.reminderStage, settings.reminders);
    if (!next) continue;
    // Client says it is paid: do not chase them, chase the owner to confirm
    if (inv.paymentReportedAt) {
      if (next.kind !== "due_soon") {
        for (const o of owners) await notifyUser({ userId: o.id, type: "approval_response", title: `Confirm payment for ${inv.number}`, body: "The client reported this as paid; it is past due in the system. Check the bank and press Mark paid.", link: `/invoices?invoice=${inv.id}`, clientId: inv.clientId }).catch(() => {});
        await prisma.studioInvoice.update({ where: { id: inv.id }, data: { reminderStage: next.stage, lastReminderAt: now } });
        out.push({ number: inv.number, stage: next.stage, result: "owner nudged (client reported paid)" });
      }
      continue;
    }
    const billTo = inv.billTo as unknown as BillTo;
    if (!billTo.email) {
      await prisma.studioInvoice.update({ where: { id: inv.id }, data: { reminderStage: next.stage, lastReminderAt: now } });
      out.push({ number: inv.number, stage: next.stage, result: "no email" });
      continue;
    }
    const view = buildInvoiceView(inv, settings);
    try {
      const emailId = await sendReminderEmail(next.kind, view, billTo.email);
      await prisma.studioInvoice.update({ where: { id: inv.id }, data: { reminderStage: next.stage, lastReminderAt: now } });
      await logInvoiceActivity({ clientId: inv.clientId, actor: "system", action: `invoice_reminder_${next.kind}`, details: `${next.kind === "final" ? "Final notice (Mahnung)" : next.kind === "overdue" ? "Payment reminder" : "Due-soon reminder"} for ${inv.number} emailed to ${billTo.email}${emailId ? ` (email ${emailId})` : ""}` });
      if (next.kind === "final") {
        for (const o of owners) await notifyUser({ userId: o.id, type: "approval_response", title: `Final notice sent for ${inv.number}`, body: "Third reminder went out. Decide whether to pause work or escalate.", link: `/invoices?invoice=${inv.id}`, clientId: inv.clientId }).catch(() => {});
        await notifySlack(`:rotating_light: Final payment notice sent for invoice *${inv.number}*.\n${process.env.NEXT_PUBLIC_APP_URL || "https://app.blokblokstudio.com"}/invoices?invoice=${inv.id}`).catch(() => {});
      }
      out.push({ number: inv.number, stage: next.stage, result: "sent" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "failed";
      await logInvoiceActivity({ clientId: inv.clientId, actor: "system", action: "invoice_reminder_failed", details: `Reminder for ${inv.number} failed: ${msg}` });
      out.push({ number: inv.number, stage: next.stage, result: `failed: ${msg}` });
    }
  }
  return out;
}
