import prisma from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";
import { sendTelegramMessage } from "@/lib/telegram";
import { formatMoney } from "./money";

/**
 * An automation prepared an invoice and is waiting for the owner's yes:
 * mark the draft ready and ping the owner (inbox + private Telegram). The
 * link opens the preview straight away, so review-and-send is one tap.
 */
export async function markReadyForReview(invoiceId: string, why: string): Promise<void> {
  const inv = await prisma.studioInvoice.update({
    where: { id: invoiceId },
    data: { readyAt: new Date() },
    select: { id: true, clientId: true, total: true, currency: true, client: { select: { name: true, company: true } } },
  });
  const who = inv.client?.company || inv.client?.name || "A client";
  const amount = formatMoney(Number(inv.total), inv.currency, "en");
  const link = `/invoices?invoice=${inv.id}&preview=1`;
  const title = `Invoice ready to send: ${who}, ${amount}`;
  const body = `${why} Check it and press Issue and email.`;
  const owners = await prisma.user.findMany({ where: { role: "OWNER", isActive: true }, select: { id: true } });
  for (const o of owners) await notifyUser({ userId: o.id, type: "approval_response", title, body, link, clientId: inv.clientId }).catch(() => {});
  const chat = process.env.ADMIN_TELEGRAM_CHAT_ID;
  if (chat) {
    const base = (process.env.NEXT_PUBLIC_APP_URL || "https://app.blokblokstudio.com").replace(/\/$/, "");
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    await sendTelegramMessage(chat, `🧾 <b>${esc(title)}</b>\n${esc(body)}\n${base}${link}`).catch(() => {});
  }
}
