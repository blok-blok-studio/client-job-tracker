import { createHash } from "crypto";
import prisma from "@/lib/prisma";
import { setSetting } from "@/lib/lifecycle/settings";
import { rateToEurOn } from "./revenue";

/**
 * One-time migration: Stripe payment history pasted in, one per line:
 *   date,amount,currency,email,description,status
 * status is optional: refunded or disputed mean the money did not stay. No
 * Stripe connection is involved. Re-importing the same text changes nothing.
 */
export interface ImportResult {
  rows: number;
  created: number;
  updated: number;
  unmatched: number;
  skipped: string[];
  byYear: Record<string, Record<string, number>>;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function parseImport(text: string) {
  const out: Array<{ date: string; amount: number; currency: string; email: string; description: string; status: string }> = [];
  const skipped: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.toLowerCase().startsWith("date,")) continue;
    const [date, amount, currency, email, description, status] = line.split(",").map((s) => (s ?? "").trim());
    const value = Number(amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !Number.isFinite(value) || value <= 0 || !/^[A-Za-z]{3}$/.test(currency || "")) {
      skipped.push(line.slice(0, 80));
      continue;
    }
    out.push({ date, amount: value, currency: currency.toUpperCase(), email: (email || "").toLowerCase(), description: description || "Stripe payment", status: (status || "").toLowerCase() });
  }
  return { rows: out, skipped };
}

export async function importStripeHistory(text: string, actor: string): Promise<ImportResult> {
  const { rows, skipped } = parseImport(text);
  const res: ImportResult = { rows: rows.length, created: 0, updated: 0, unmatched: 0, skipped, byYear: {} };
  const seen = new Map<string, number>();
  const rates = new Map<string, number | null>();
  const clients = new Map<string, string | null>();
  for (const r of rows) {
    // Identical payments on one day are real (two $50 subscriptions), so the position among them is part of the id
    const key = `${r.date}|${r.amount}|${r.currency}|${r.email}|${r.description}`;
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    const stripeChargeId = `import_${createHash("sha256").update(`${key}|${n}`).digest("hex").slice(0, 24)}`;
    const paidAt = new Date(`${r.date}T12:00:00Z`);
    const rateKey = `${r.currency}|${r.date}`;
    if (!rates.has(rateKey)) rates.set(rateKey, r.currency === "EUR" ? 1 : (await rateToEurOn(r.currency, paidAt)).rate);
    const rate = rates.get(rateKey)!;
    if (r.email && !clients.has(r.email)) clients.set(r.email, (await prisma.client.findFirst({ where: { email: { equals: r.email, mode: "insensitive" } }, select: { id: true } }))?.id ?? null);
    const clientId = r.email ? (clients.get(r.email) ?? null) : null;
    if (!clientId) res.unmatched++;
    const lost = r.status === "refunded" || r.status === "disputed";
    const eurGross = rate != null ? round2(r.amount * rate) : null;
    const data = {
      clientId,
      amount: r.amount,
      refunded: lost ? r.amount : 0,
      currency: r.currency,
      eurGross,
      eurNet: eurGross != null ? (lost ? 0 : eurGross) : null,
      paidAt,
      taxYear: paidAt.getUTCFullYear(),
      description: r.description,
      billingEmail: r.email || null,
      disputed: r.status === "disputed",
      syncedAt: new Date(),
    };
    const existing = await prisma.stripePayment.findUnique({ where: { stripeChargeId }, select: { id: true } });
    if (existing) {
      await prisma.stripePayment.update({ where: { id: existing.id }, data });
      res.updated++;
    } else {
      await prisma.stripePayment.create({ data: { stripeChargeId, ...data } });
      res.created++;
    }
    if (!lost) {
      const y = (res.byYear[String(data.taxYear)] ||= {});
      y[r.currency] = round2((y[r.currency] || 0) + r.amount);
    }
  }
  if (rows.length) {
    await setSetting("stripe_ledger_full_at", new Date().toISOString(), actor);
    await setSetting("stripe_ledger_last_sync", { syncedAt: new Date().toISOString(), rows: rows.length, created: res.created, updated: res.updated, unmatched: res.unmatched, byYear: res.byYear }, actor);
    await prisma.activityLog.create({ data: { actor, action: "stripe_history_imported", details: `Stripe history imported: ${rows.length} payments, ${res.created} new, ${res.unmatched} without a client` } }).catch(() => {});
  }
  return res;
}
