import prisma from "@/lib/prisma";
import { trackerRows } from "./tracker";
import { rateToEurOn } from "./revenue";

/**
 * Stripe-dashboard style numbers rebuilt from our own records: every imported
 * Stripe payment plus our own paid invoices. Income follows the date money
 * arrived, in EUR, net of refunds and lost disputes, before Stripe fees.
 */
export interface MonthPoint { month: string; subscriptions: number; oneOff: number; total: number; cumulative: number; payments: number }
export interface ClientPoint { client: string; eur: number; payments: number }
export interface Analytics {
  year: number | null;
  years: Array<{ year: number; eur: number; payments: number; customers: number }>;
  months: MonthPoint[];
  topClients: ClientPoint[];
  totals: {
    grossEur: number; netEur: number; lostEur: number; refunds: number; disputes: number;
    payments: number; avgEur: number; customers: number; newCustomers: number;
    subscriptionShare: number; byCurrency: Record<string, number>;
  };
  mrr: { eur: number; plans: number; byCurrency: Record<string, number> };
  ceilingEur: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const LIVE = ["active", "past_due", "trialing"];

export async function buildAnalytics(year: number | null): Promise<Analytics> {
  const [rows, planInvoices, plans] = await Promise.all([
    trackerRows(),
    prisma.studioInvoice.findMany({ where: { planId: { not: null } }, select: { id: true } }),
    prisma.recurringPlan.findMany({ select: { status: true, interval: true, currency: true, items: true, stripeSubStatus: true, stripeSubscriptionId: true } }),
  ]);
  const fromPlan = new Set(planInvoices.map((i) => i.id));
  // Money that arrived: Stripe payments and paid invoices with an EUR amount
  const money = rows.filter((r) => r.eur != null && (r.source === "stripe" || r.status === "PAID"));
  const isSub = (r: (typeof money)[number]) => (r.source === "stripe" ? /^subscription/i.test(r.description) : fromPlan.has(r.id));

  const firstYear = new Map<string, number>();
  for (const r of [...money].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const key = r.clientId || r.client;
    if ((r.eur ?? 0) > 0 && !firstYear.has(key)) firstYear.set(key, r.year);
  }

  const byYear = new Map<number, { eur: number; payments: number; clients: Set<string> }>();
  for (const r of money) {
    const y = byYear.get(r.year) || { eur: 0, payments: 0, clients: new Set<string>() };
    y.eur = r2(y.eur + (r.eur ?? 0));
    y.payments++;
    if ((r.eur ?? 0) > 0) y.clients.add(r.clientId || r.client);
    byYear.set(r.year, y);
  }
  const years = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([y, v]) => ({ year: y, eur: v.eur, payments: v.payments, customers: v.clients.size }));

  const scoped = year ? money.filter((r) => r.year === year) : money;
  // Months: the 12 months of the year, or every month from the first payment for all time
  const keys: string[] = [];
  if (year) for (let m = 1; m <= 12; m++) keys.push(`${year}-${String(m).padStart(2, "0")}`);
  else if (money.length) {
    const first = money.reduce((a, r) => (r.date < a ? r.date : a), money[0].date);
    const d = new Date(`${first.slice(0, 7)}-01T00:00:00Z`);
    const end = new Date();
    while (d <= end) { keys.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); }
  }
  const monthMap = new Map(keys.map((k) => [k, { month: k, subscriptions: 0, oneOff: 0, total: 0, cumulative: 0, payments: 0 }]));
  for (const r of scoped) {
    const m = monthMap.get(r.date.slice(0, 7));
    if (!m) continue;
    if (isSub(r)) m.subscriptions = r2(m.subscriptions + (r.eur ?? 0));
    else m.oneOff = r2(m.oneOff + (r.eur ?? 0));
    m.total = r2(m.subscriptions + m.oneOff);
    m.payments++;
  }
  let run = 0;
  const months = [...monthMap.values()].map((m) => { run = r2(run + m.total); return { ...m, cumulative: run }; });

  const clientMap = new Map<string, ClientPoint>();
  for (const r of scoped) {
    const c = clientMap.get(r.client) || { client: r.client, eur: 0, payments: 0 };
    c.eur = r2(c.eur + (r.eur ?? 0));
    c.payments++;
    clientMap.set(r.client, c);
  }
  const ranked = [...clientMap.values()].filter((c) => c.eur > 0).sort((a, b) => b.eur - a.eur);
  const topClients = ranked.slice(0, 9);
  if (ranked.length > 9) topClients.push(ranked.slice(9).reduce((o, c) => ({ client: `${ranked.length - 9} other clients`, eur: r2(o.eur + c.eur), payments: o.payments + c.payments }), { client: "", eur: 0, payments: 0 }));

  // Gross counts refunded and disputed money too, the way Stripe's gross volume does
  let grossEur = 0, lostEur = 0, refunds = 0, disputes = 0, subEur = 0;
  const byCurrency: Record<string, number> = {};
  const customers = new Set<string>();
  for (const r of scoped) {
    const net = r.eur ?? 0;
    const gross = r.eurGross ?? net;
    grossEur = r2(grossEur + gross);
    if (r.refunded > 0) {
      lostEur = r2(lostEur + Math.max(0, gross - net));
      if (r.status === "DISPUTED") disputes++; else refunds++;
    }
    if (isSub(r)) subEur = r2(subEur + net);
    if (net > 0) customers.add(r.clientId || r.client);
    byCurrency[r.currency] = r2((byCurrency[r.currency] || 0) + r.amount - r.refunded);
  }
  const netEur = r2(scoped.reduce((n, r) => n + (r.eur ?? 0), 0));
  const payments = scoped.filter((r) => (r.eur ?? 0) > 0).length;
  const newCustomers = year ? [...customers].filter((c) => firstYear.get(c) === year).length : customers.size;

  // MRR: subscriptions still live in Stripe plus our own active plans, as a monthly amount in EUR today
  const mrrByCurrency: Record<string, number> = {};
  let mrrPlans = 0;
  for (const p of plans) {
    const live = p.stripeSubscriptionId ? LIVE.includes(p.stripeSubStatus || "") : p.status === "ACTIVE";
    if (!live) continue;
    const items = (p.items as unknown as Array<{ qty?: number; unitPrice?: number }>) || [];
    const amount = items.reduce((n, i) => n + Number(i.qty ?? 1) * Number(i.unitPrice ?? 0), 0);
    const monthly = p.interval === "YEARLY" ? amount / 12 : p.interval === "QUARTERLY" ? amount / 3 : amount;
    mrrByCurrency[p.currency] = r2((mrrByCurrency[p.currency] || 0) + monthly);
    mrrPlans++;
  }
  let mrrEur = 0;
  for (const [c, v] of Object.entries(mrrByCurrency)) mrrEur = r2(mrrEur + v * (c === "EUR" ? 1 : ((await rateToEurOn(c, new Date())).rate ?? 0)));

  return {
    year,
    years,
    months,
    topClients,
    totals: {
      grossEur, netEur, lostEur, refunds, disputes, payments,
      avgEur: payments ? r2(netEur / payments) : 0,
      customers: customers.size, newCustomers,
      subscriptionShare: netEur > 0 ? Math.round((subEur / netEur) * 1000) / 10 : 0,
      byCurrency,
    },
    mrr: { eur: mrrEur, plans: mrrPlans, byCurrency: mrrByCurrency },
    ceilingEur: 100_000,
  };
}
