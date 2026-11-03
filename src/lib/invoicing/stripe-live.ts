import prisma from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { rateToEurOn } from "./revenue";

/**
 * Keeps the imported Stripe history current while Stripe is still in use.
 * Called from the webhook: Stripe pushes each event in, nothing here changes
 * anything in Stripe. Every step is best-effort and safe to repeat, and the
 * monthly balance-history import still reconciles anything missed.
 */
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function feeFor(chargeId: string): Promise<{ fee: number; txnId: string; net: number; amount: number; currency: string; created: Date; availableOn: Date | null; payoutId: string | null } | null> {
  // Needs read access on the key; without it the fee arrives with the next balance import
  try {
    const ch = await stripe.charges.retrieve(chargeId, { expand: ["balance_transaction"] });
    const bt = ch.balance_transaction;
    if (!bt || typeof bt === "string") return null;
    return {
      fee: bt.fee / 100, txnId: bt.id, net: bt.net / 100, amount: bt.amount / 100, currency: bt.currency.toUpperCase(),
      created: new Date(bt.created * 1000), availableOn: bt.available_on ? new Date(bt.available_on * 1000) : null, payoutId: null,
    };
  } catch {
    return null;
  }
}

export async function recordLivePayment(p: {
  chargeId: string | null; // ch_/py_ when known
  fallbackId: string; // payment intent or invoice id, used only when the charge id is unknown
  amountCents: number;
  currency: string;
  paidAt: Date;
  clientId: string | null;
  email: string | null;
  name: string | null;
  description: string;
  stripeInvoiceId?: string | null;
}): Promise<void> {
  if (p.amountCents <= 0) return;
  const amount = p.amountCents / 100;
  const currency = p.currency.toUpperCase();
  // Already recorded (by a previous delivery of this event or by an import)
  if (p.chargeId && (await prisma.stripePayment.findFirst({ where: { OR: [{ sourceId: p.chargeId }, { stripeChargeId: p.chargeId }] }, select: { id: true } }))) return;
  const key = p.chargeId || `live_${p.fallbackId}`;
  if (await prisma.stripePayment.findUnique({ where: { stripeChargeId: key }, select: { id: true } })) return;

  const rate = currency === "EUR" ? 1 : (await rateToEurOn(currency, p.paidAt)).rate;
  const eur = rate != null ? r2(amount * rate) : null;
  const bt = p.chargeId ? await feeFor(p.chargeId) : null;
  await prisma.stripePayment.create({
    data: {
      stripeChargeId: key,
      // Only a real charge id goes in sourceId, so the balance import can still match the others by amount and date
      sourceId: p.chargeId,
      clientId: p.clientId,
      amount,
      currency,
      fee: bt?.fee ?? null,
      settledCurrency: bt?.currency ?? null,
      settledAmount: bt?.amount ?? null,
      eurGross: eur,
      eurNet: eur,
      paidAt: p.paidAt,
      taxYear: p.paidAt.getUTCFullYear(),
      description: p.description,
      billingEmail: p.email?.toLowerCase() || null,
      billingName: p.name,
      stripeInvoiceId: p.stripeInvoiceId ?? null,
    },
  });
  if (bt && p.chargeId) {
    await prisma.stripeLedgerEntry.upsert({
      where: { txnId: bt.txnId },
      create: { txnId: bt.txnId, type: "charge", sourceId: p.chargeId, amount: bt.amount, fee: bt.fee, net: bt.net, currency: bt.currency, createdAt: bt.created, availableOn: bt.availableOn, description: p.description, taxYear: bt.created.getUTCFullYear() },
      update: {},
    });
  }
}

export async function recordLiveRefund(chargeId: string, amountRefundedCents: number, disputed = false): Promise<void> {
  const row = await prisma.stripePayment.findFirst({ where: { OR: [{ sourceId: chargeId }, { stripeChargeId: chargeId }] } });
  if (!row) return;
  const amount = Number(row.amount);
  const refunded = Math.min(amount, amountRefundedCents / 100);
  const gross = row.eurGross != null ? Number(row.eurGross) : null;
  await prisma.stripePayment.update({
    where: { id: row.id },
    data: { refunded, disputed: disputed || row.disputed, eurNet: gross != null ? r2(gross * (1 - refunded / amount)) : row.eurNet },
  });
}

/** The invoice's register entry and PDF, fetched from Stripe's own PDF link in the event. */
export async function recordLiveInvoiceDocument(inv: {
  id: string; number: string | null; status: string; currency: string; total: number; amountPaid: number;
  created: number; paidAt: Date | null; email: string | null; name: string | null; chargeId: string | null; subscriptionId: string | null; pdfUrl: string | null; clientId: string | null;
}): Promise<void> {
  const issuedAt = new Date(inv.created * 1000);
  const data = {
    number: inv.number, customerEmail: inv.email?.toLowerCase() || null, customerName: inv.name, status: inv.status,
    currency: inv.currency.toUpperCase(), total: inv.total / 100, amountPaid: inv.amountPaid / 100, issuedAt, paidAt: inv.paidAt,
    chargeId: inv.chargeId, subscriptionId: inv.subscriptionId, taxYear: (inv.paidAt || issuedAt).getUTCFullYear(),
  };
  const existing = await prisma.stripeDocument.findUnique({ where: { stripeInvoiceId: inv.id }, select: { id: true, clientId: true, pdfBytes: true } });
  const doc = existing
    ? await prisma.stripeDocument.update({ where: { id: existing.id }, data: { ...data, clientId: existing.clientId ?? inv.clientId } })
    : await prisma.stripeDocument.create({ data: { stripeInvoiceId: inv.id, clientId: inv.clientId, ...data } });
  if (existing?.pdfBytes || !inv.pdfUrl) return;
  // Only Stripe's own PDF host is fetched
  if (!/^https:\/\/pay\.stripe\.com\//.test(inv.pdfUrl)) return;
  try {
    const res = await fetch(inv.pdfUrl, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > 3 * 1024 * 1024 || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return;
    await prisma.stripeDocument.update({ where: { id: doc.id }, data: { pdf: Buffer.from(bytes), pdfBytes: bytes.length } });
  } catch (err) {
    console.error("[stripe-live] invoice PDF fetch failed:", err);
  }
}

/**
 * Disputes. Opened: the payment is flagged. Lost: the money is gone, so it stops
 * counting as income. Won: the flag is cleared. The dispute's own balance lines
 * (the withdrawal and Stripe's dispute fee) go into the ledger so the fee shows
 * under money out.
 */
export async function recordLiveDispute(d: {
  chargeId: string;
  status: string;
  amountCents: number;
  balanceTransactions: Array<{ id: string; amount: number; fee: number; net: number; currency: string; created: number; available_on?: number | null; description?: string | null }>;
}): Promise<void> {
  const row = await prisma.stripePayment.findFirst({ where: { OR: [{ sourceId: d.chargeId }, { stripeChargeId: d.chargeId }] } });
  if (row) {
    const amount = Number(row.amount);
    if (d.status === "lost") {
      await prisma.stripePayment.update({ where: { id: row.id }, data: { disputed: true, refunded: amount, eurNet: 0 } });
    } else if (d.status === "won") {
      await prisma.stripePayment.update({ where: { id: row.id }, data: { disputed: false } });
    } else {
      await prisma.stripePayment.update({ where: { id: row.id }, data: { disputed: true } });
    }
  }
  for (const bt of d.balanceTransactions || []) {
    const created = new Date(bt.created * 1000);
    await prisma.stripeLedgerEntry.upsert({
      where: { txnId: bt.id },
      create: {
        txnId: bt.id, type: "adjustment", sourceId: d.chargeId, amount: bt.amount / 100, fee: bt.fee / 100, net: bt.net / 100,
        currency: bt.currency.toUpperCase(), createdAt: created, availableOn: bt.available_on ? new Date(bt.available_on * 1000) : null,
        description: bt.description || "Dispute", taxYear: created.getUTCFullYear(),
      },
      update: {},
    });
  }
}
