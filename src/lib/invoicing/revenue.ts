import prisma from "@/lib/prisma";
import { loadInvoiceSettings } from "./settings";
import { notifyUser } from "@/lib/notifications";

/**
 * Kleinunternehmer watch. § 19 UStG ends the moment revenue in a calendar
 * year crosses the ceiling (EUR 100,000 in 2026), mid-year, with no grace.
 * Counts every issued studio invoice (not voided) plus every PAID Stripe
 * invoice, converted to EUR. Owner-only information: it goes to the owner's
 * in-app inbox and the /invoices page, never to Slack (team-visible).
 */
let rateCache: { rate: number; at: number } | null = null;
export async function usdToEur(): Promise<number> {
  if (rateCache && Date.now() - rateCache.at < 3_600_000) return rateCache.rate;
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR", { next: { revalidate: 3600 } });
    const json = (await res.json()) as { rates?: { EUR?: number } };
    const rate = json.rates?.EUR;
    if (typeof rate === "number") {
      rateCache = { rate, at: Date.now() };
      return rate;
    }
  } catch {
    // fall through
  }
  return rateCache?.rate ?? 0.92;
}

/** USD→EUR on a given date (ECB via frankfurter; weekends/holidays roll back to the last fixing). Falls back to the latest rate. */
export async function usdToEurOn(date: Date): Promise<{ rate: number; rateDate: string }> {
  const iso = date.toISOString().slice(0, 10);
  try {
    const res = await fetch(`https://api.frankfurter.app/${iso}?from=USD&to=EUR`, { next: { revalidate: 86400 } });
    const json = (await res.json()) as { date?: string; rates?: { EUR?: number } };
    if (typeof json.rates?.EUR === "number") return { rate: json.rates.EUR, rateDate: json.date || iso };
  } catch {
    // fall through
  }
  return { rate: await usdToEur(), rateDate: "latest" };
}

/** Any ECB-listed currency → EUR on a date. rate null when the ECB has no fixing for it. */
export async function rateToEurOn(currency: string, date: Date): Promise<{ rate: number | null; rateDate: string }> {
  const c = currency.toUpperCase();
  if (c === "EUR") return { rate: 1, rateDate: date.toISOString().slice(0, 10) };
  if (c === "USD") return usdToEurOn(date);
  const iso = date.toISOString().slice(0, 10);
  try {
    const res = await fetch(`https://api.frankfurter.app/${iso}?from=${c}&to=EUR`, { next: { revalidate: 86400 } });
    if (res.ok) {
      const json = (await res.json()) as { date?: string; rates?: { EUR?: number } };
      if (typeof json.rates?.EUR === "number") return { rate: json.rates.EUR, rateDate: json.date || iso };
    }
  } catch {
    // fall through
  }
  return { rate: null, rateDate: iso };
}

export interface MonthIncome {
  month: string; // YYYY-MM
  count: number;
  byCurrency: Record<string, number>;
  eur: number; // sum of eurAmount (USD converted at the payment-date rate)
}

/** Paid studio invoices as income: per month, in invoice currency and in EUR as booked. */
export async function incomeByMonth(year: number): Promise<{ year: number; months: MonthIncome[]; ytdEur: number; ytdByCurrency: Record<string, number>; count: number }> {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  const rows = await prisma.studioInvoice.findMany({
    where: { status: "PAID", paidAt: { gte: from, lt: to } },
    select: { total: true, currency: true, paidAt: true, eurAmount: true },
  });
  const latest = await usdToEur();
  const months = new Map<string, MonthIncome>();
  const ytdByCurrency: Record<string, number> = {};
  let ytdEur = 0;
  for (const r of rows) {
    const key = r.paidAt!.toISOString().slice(0, 7);
    const m = months.get(key) || { month: key, count: 0, byCurrency: {}, eur: 0 };
    const total = Number(r.total);
    const eur = r.eurAmount != null ? Number(r.eurAmount) : r.currency === "EUR" ? total : r.currency === "USD" ? Math.round(total * latest * 100) / 100 : 0;
    m.count++;
    m.byCurrency[r.currency] = Math.round(((m.byCurrency[r.currency] || 0) + total) * 100) / 100;
    m.eur = Math.round((m.eur + eur) * 100) / 100;
    months.set(key, m);
    ytdByCurrency[r.currency] = Math.round(((ytdByCurrency[r.currency] || 0) + total) * 100) / 100;
    ytdEur = Math.round((ytdEur + eur) * 100) / 100;
  }
  return { year, months: [...months.values()].sort((a, b) => (a.month < b.month ? 1 : -1)), ytdEur, ytdByCurrency, count: rows.length };
}

export interface YearRevenue {
  year: number;
  studioEur: number;
  stripeEur: number;
  totalEur: number;
  ceilingEur: number;
  pct: number; // 0..100+
  rate: number; // USD→EUR used
  kleinunternehmerUntil: string;
}

export async function yearRevenueEur(year: number): Promise<YearRevenue> {
  const settings = await loadInvoiceSettings();
  const rate = await usdToEur();
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));

  const studio = await prisma.studioInvoice.findMany({
    where: { status: { in: ["ISSUED", "SENT", "PAID"] }, issueDate: { gte: from, lt: to } },
    select: { total: true, currency: true },
  });
  const stripe = await prisma.invoice.findMany({
    where: { status: "PAID", OR: [{ paidAt: { gte: from, lt: to } }, { paidAt: null, createdAt: { gte: from, lt: to } }] },
    select: { amount: true, currency: true },
  });
  const others = [...new Set([...studio, ...stripe].map((i) => i.currency.toUpperCase()).filter((c) => c !== "EUR" && c !== "USD"))];
  const otherRates: Record<string, number> = {};
  for (const c of others) otherRates[c] = (await rateToEurOn(c, new Date())).rate ?? 0;
  const toEur = (amount: number, currency: string) => {
    const c = currency.toUpperCase();
    return c === "EUR" ? amount : c === "USD" ? amount * rate : amount * (otherRates[c] ?? 0);
  };
  const studioEur = studio.reduce((s, i) => s + toEur(Number(i.total), i.currency), 0);
  const stripeEur = stripe.reduce((s, i) => s + toEur(Number(i.amount), i.currency), 0);
  const totalEur = Math.round((studioEur + stripeEur) * 100) / 100;
  const ceilingEur = settings.revenueCeilingEur || 100000;
  return {
    year,
    studioEur: Math.round(studioEur * 100) / 100,
    stripeEur: Math.round(stripeEur * 100) / 100,
    totalEur,
    ceilingEur,
    pct: ceilingEur ? Math.round((totalEur / ceilingEur) * 1000) / 10 : 0,
    rate,
    kleinunternehmerUntil: settings.kleinunternehmerUntil,
  };
}

async function alreadySent(action: string, details: string): Promise<boolean> {
  const row = await prisma.activityLog.findFirst({ where: { action, details }, select: { id: true } });
  return !!row;
}
async function markSent(action: string, details: string) {
  await prisma.activityLog.create({ data: { actor: "system", action, details } });
}
async function owners(): Promise<string[]> {
  const rows = await prisma.user.findMany({ where: { role: "OWNER", isActive: true }, select: { id: true } });
  return rows.map((r) => r.id);
}

/**
 * Runs from the 6-hourly cron. Two reminders, each sent once:
 *  - revenue past 80% / 90% / 100% of the ceiling in the current year
 *  - mid-December of the § 19 year: switch both templates to the 2027 VAT
 *    version (automatic by issue date here) and confirm VAT filing with
 *    BD Berlin Digital Tax.
 */
export async function runInvoiceReminders(now = new Date()): Promise<string[]> {
  const out: string[] = [];
  const year = now.getUTCFullYear();
  const settings = await loadInvoiceSettings();
  const ownerIds = await owners();
  if (!ownerIds.length) return out;

  const rev = await yearRevenueEur(year);
  for (const stage of [80, 90, 100]) {
    if (rev.pct < stage) continue;
    const key = `${year}#${stage}`;
    if (await alreadySent("invoice_revenue_alert", key)) continue;
    const title =
      stage >= 100
        ? `${year} revenue has crossed the EUR ${rev.ceilingEur.toLocaleString("en-US")} Kleinunternehmer ceiling`
        : `${year} revenue is at ${rev.pct}% of the EUR ${rev.ceilingEur.toLocaleString("en-US")} Kleinunternehmer ceiling`;
    const body =
      stage >= 100
        ? "Crossing the ceiling ends § 19 UStG immediately, mid-year. Stop issuing § 19 invoices and call BD Berlin Digital Tax today."
        : "Crossing EUR 100,000 ends § 19 UStG instantly, mid-year. Talk to BD Berlin Digital Tax before it happens.";
    for (const id of ownerIds) {
      await notifyUser({ userId: id, type: "connection_problem", title, body, link: "/invoices" }).catch(() => {});
    }
    await markSent("invoice_revenue_alert", key);
    out.push(`revenue alert ${stage}%`);
  }

  // Mid-December reminder in the last Kleinunternehmer year
  const kuYear = Number(settings.kleinunternehmerUntil.slice(0, 4));
  const dec10 = new Date(Date.UTC(kuYear, 11, 10));
  if (now >= dec10 && now < new Date(Date.UTC(kuYear + 1, 0, 15))) {
    const key = `vat_switch#${kuYear}`;
    if (!(await alreadySent("invoice_vat_switch_reminder", key))) {
      for (const id of ownerIds) {
        await notifyUser({
          userId: id,
          type: "connection_problem",
          title: `Invoices switch to regular VAT on 1 Jan ${kuYear + 1}`,
          body: `German invoices issued from 1 Jan ${kuYear + 1} will add 19% USt automatically and drop the § 19 note. Confirm the VAT filing setup (USt-Voranmeldung) and the USt-IdNr with BD Berlin Digital Tax now, and add the USt-IdNr in invoice settings once issued.`,
          link: "/invoices?tab=settings",
        }).catch(() => {});
      }
      await markSent("invoice_vat_switch_reminder", key);
      out.push("vat switch reminder");
    }
  }
  return out;
}
