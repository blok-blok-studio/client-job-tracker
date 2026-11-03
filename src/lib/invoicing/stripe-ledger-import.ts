import prisma from "@/lib/prisma";
import { setSetting } from "@/lib/lifecycle/settings";
import { rateToEurOn } from "./revenue";

/**
 * One-time import of Stripe's "All activity" export (balance history, all columns, UTC).
 * Stores every line, then gives each imported payment its real Stripe id, fee and
 * settled amount. No Stripe connection is involved; importing the same file again
 * changes nothing.
 */
export interface LedgerImportResult {
  lines: number;
  created: number;
  paymentsMatched: number;
  paymentsAdded: number;
  byYear: Record<
    string,
    { fees: Record<string, number>; payouts: Record<string, number> }
  >;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c !== "")) out.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((c) => c !== "")) out.push(row);
  }
  const [head, ...body] = out;
  if (!head) return [];
  return body.map((r) =>
    Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])),
  );
}

const utc = (s: string) =>
  new Date(`${s.replace(" ", "T")}${s.length <= 16 ? ":00" : ""}Z`);

export async function importStripeLedger(
  text: string,
  actor: string,
): Promise<LedgerImportResult> {
  const rows = parseCsv(text);
  if (
    !rows.length ||
    !("id" in rows[0]) ||
    !("Created (UTC)" in rows[0]) ||
    !("Fee" in rows[0])
  ) {
    throw new Error(
      "This is not Stripe's balance history export. Use Transactions, All activity, Export, all columns, UTC.",
    );
  }
  const res: LedgerImportResult = {
    lines: rows.length,
    created: 0,
    paymentsMatched: 0,
    paymentsAdded: 0,
    byYear: {},
  };
  const year = (y: number) =>
    (res.byYear[String(y)] ||= { fees: {}, payouts: {} });

  const entries = rows
    .filter((r) => r.id?.startsWith("txn_"))
    .map((r) => {
      const createdAt = utc(r["Created (UTC)"]);
      return {
        txnId: r.id,
        type: r.Type,
        sourceId: r.Source || null,
        amount: Number(r.Amount || 0),
        fee: Number(r.Fee || 0),
        net: Number(r.Net || 0),
        currency: (r.Currency || "").toUpperCase(),
        createdAt,
        availableOn: r["Available On (UTC)"]
          ? utc(r["Available On (UTC)"])
          : null,
        description: r.Description || null,
        payoutId: r.Transfer || null,
        taxYear: createdAt.getUTCFullYear(),
      };
    });

  const existing = new Set(
    (
      await prisma.stripeLedgerEntry.findMany({
        where: { txnId: { in: entries.map((e) => e.txnId) } },
        select: { txnId: true },
      })
    ).map((e) => e.txnId),
  );
  const fresh = entries.filter((e) => !existing.has(e.txnId));
  for (let i = 0; i < fresh.length; i += 200) {
    const r = await prisma.stripeLedgerEntry.createMany({
      data: fresh.slice(i, i + 200),
      skipDuplicates: true,
    });
    res.created += r.count;
  }

  for (const e of entries) {
    const y = year(e.taxYear);
    // Money Stripe kept: card fees, conversion and dispute fees, plus its own billing charges
    const kept = e.fee + (e.type === "stripe_fee" ? -e.amount : 0);
    if (kept) y.fees[e.currency] = r2((y.fees[e.currency] || 0) + kept);
    if (e.type === "payout")
      y.payouts[e.currency] = r2((y.payouts[e.currency] || 0) - e.amount);
  }

  // Give each imported payment its Stripe id and fee. The pasted history was dated in
  // the dashboard's local time, so a payment may sit one day either side of the UTC date.
  const payments = entries.filter(
    (e) => (e.type === "charge" || e.type === "payment") && e.sourceId,
  );
  const taken = new Set(
    (
      await prisma.stripePayment.findMany({
        where: { sourceId: { not: null } },
        select: { sourceId: true },
      })
    ).map((p) => p.sourceId),
  );
  const day = 86_400_000;
  const sorted = payments.sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const link = async (
    e: (typeof entries)[number],
    before: number,
    after: number,
  ) => {
    const match = await prisma.stripePayment.findFirst({
      where: {
        sourceId: null,
        currency: e.currency,
        amount: e.amount,
        paidAt: {
          gte: new Date(e.createdAt.getTime() - before * day),
          lte: new Date(e.createdAt.getTime() + after * day),
        },
      },
      orderBy: { paidAt: "asc" },
      select: { id: true },
    });
    if (!match) return false;
    await prisma.stripePayment.update({
      where: { id: match.id },
      data: {
        sourceId: e.sourceId,
        fee: e.fee,
        settledCurrency: e.currency,
        settledAmount: e.amount,
      },
    });
    taken.add(e.sourceId);
    res.paymentsMatched++;
    return true;
  };
  // Close matches first, then bank payments that Stripe books a few days after the dashboard date
  for (const e of sorted) if (!taken.has(e.sourceId)) await link(e, 1.5, 1.5);
  for (const e of sorted) if (!taken.has(e.sourceId)) await link(e, 7, 1.5);
  for (const e of sorted) {
    if (taken.has(e.sourceId)) continue;
    // A payment the pasted history did not have (for example, charged after it was taken)
    const rate =
      e.currency === "EUR"
        ? 1
        : (await rateToEurOn(e.currency, e.createdAt)).rate;
    const eur = rate != null ? r2(e.amount * rate) : null;
    await prisma.stripePayment.create({
      data: {
        stripeChargeId: e.sourceId!,
        sourceId: e.sourceId,
        amount: e.amount,
        currency: e.currency,
        fee: e.fee,
        settledCurrency: e.currency,
        settledAmount: e.amount,
        eurGross: eur,
        eurNet: eur,
        paidAt: e.createdAt,
        taxYear: e.taxYear,
        description: e.description || "Stripe payment",
      },
    });
    res.paymentsAdded++;
    taken.add(e.sourceId);
  }

  await setSetting(
    "stripe_ledger_imported",
    { at: new Date().toISOString(), lines: res.lines, byYear: res.byYear },
    actor,
  );
  await prisma.activityLog
    .create({
      data: {
        actor,
        action: "stripe_ledger_imported",
        details: `Stripe balance history imported: ${res.lines} lines, ${res.paymentsMatched} payments matched, ${res.paymentsAdded} added`,
      },
    })
    .catch(() => {});
  return res;
}
