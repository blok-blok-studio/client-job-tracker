import type Stripe from "stripe";
import prisma from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { rateToEurOn } from "./revenue";
import { createPlan } from "./recurring";
import { defaultsForTemplate, guessCountry, templateForCountry } from "./vat";

/**
 * Reads Stripe, writes our database. Nothing here changes anything at Stripe.
 *
 * Customers: linked by Stripe id, then email; new ones become clients. Contact
 * details only fill EMPTY fields, so anything typed here is never overwritten.
 * Client status is never changed. Customers new to us are imported as PAST,
 * so the active client count stays exactly what the owner set.
 * Payments: every succeeded charge since the account began, refunds included.
 * Re-running updates rows in place, so it is always safe.
 */
export const deps = { stripe: (): Stripe => getStripe() };

export interface SyncResult {
  customersSeen: number;
  clientsCreated: number;
  clientsLinked: number;
  clientsEnriched: number;
  invoicesImported: number;
  paymentsSeen: number;
  paymentsNew: number;
  paymentsUnmatched: number;
  subscriptionsSeen: number;
  plansDrafted: number;
  years: number[];
  errors: string[];
  syncedAt: string;
  mode: "full" | "recent";
}

const fromCents = (n: number) => Math.round(n) / 100;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const COUNTRY_NAMES = (code: string): string => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
};

export interface ContactPatchInput {
  phone: string | null;
  address: Stripe.Address | null | undefined;
  taxId: string | null;
}

/** Only blanks are filled. An address is taken whole, never mixed with one already on file. */
export function contactPatch(
  client: { phone: string | null; companyAddress: string | null; companyCity: string | null; companyState: string | null; companyZip: string | null; companyCountry: string | null; country: string | null; taxId: string | null },
  src: ContactPatchInput
): Record<string, string> {
  const patch: Record<string, string> = {};
  if (!client.phone && src.phone) patch.phone = src.phone;
  if (!client.taxId && src.taxId) patch.taxId = src.taxId;
  const a = src.address;
  const hasAddress = !!(client.companyAddress || client.companyCity || client.companyZip);
  if (a && !hasAddress && (a.line1 || a.city)) {
    const street = [a.line1, a.line2].filter(Boolean).join("\n");
    if (street) patch.companyAddress = street;
    if (a.city) patch.companyCity = a.city;
    if (a.state) patch.companyState = a.state;
    if (a.postal_code) patch.companyZip = a.postal_code;
    if (a.country && !client.companyCountry) patch.companyCountry = COUNTRY_NAMES(a.country);
  }
  if (a?.country && !client.country) patch.country = a.country;
  return patch;
}

const CLIENT_SELECT = { id: true, phone: true, companyAddress: true, companyCity: true, companyState: true, companyZip: true, companyCountry: true, country: true, taxId: true, stripeCustomerId: true } as const;

async function enrich(clientId: string, src: ContactPatchInput): Promise<boolean> {
  const c = await prisma.client.findUnique({ where: { id: clientId }, select: CLIENT_SELECT });
  if (!c) return false;
  const patch = contactPatch(c, src);
  if (!Object.keys(patch).length) return false;
  await prisma.client.update({ where: { id: clientId }, data: patch });
  await prisma.activityLog.create({ data: { clientId, actor: "stripe", action: "client_details_imported", details: `Filled from Stripe: ${Object.keys(patch).join(", ")}` } }).catch(() => {});
  return true;
}

async function syncCustomers(res: SyncResult): Promise<void> {
  for await (const customer of deps.stripe().customers.list({ limit: 100, expand: ["data.tax_ids"] })) {
    res.customersSeen++;
    if ((customer as { deleted?: boolean }).deleted) continue;
    try {
      let client = await prisma.client.findUnique({ where: { stripeCustomerId: customer.id }, select: { id: true, stripeCustomerId: true } });
      if (!client && customer.email) {
        client = await prisma.client.findFirst({ where: { email: { equals: customer.email, mode: "insensitive" } }, select: { id: true, stripeCustomerId: true } });
        if (client && !client.stripeCustomerId) {
          await prisma.client.update({ where: { id: client.id }, data: { stripeCustomerId: customer.id } });
          res.clientsLinked++;
        }
      }
      if (!client) {
        if (!customer.email && !customer.name) continue;
        client = await prisma.client.create({
          data: { name: customer.name || customer.email || "Stripe customer", email: customer.email?.toLowerCase() || null, stripeCustomerId: customer.id, source: "Stripe", type: "PAST" }, // a past customer, not an active client: the active list is curated by hand
          select: { id: true, stripeCustomerId: true },
        });
        await prisma.activityLog.create({ data: { clientId: client.id, actor: "stripe", action: "created_client", details: "Imported from Stripe customer sync" } }).catch(() => {});
        res.clientsCreated++;
      }
      const address = customer.address || customer.shipping?.address || null;
      const taxId = customer.tax_ids?.data?.[0]?.value || null;
      if (await enrich(client.id, { phone: customer.phone || customer.shipping?.phone || null, address, taxId })) res.clientsEnriched++;

      for await (const inv of deps.stripe().invoices.list({ customer: customer.id, status: "paid", limit: 100 })) {
        if (!inv.id || !inv.amount_paid) continue;
        const exists = await prisma.invoice.findUnique({ where: { stripeInvoiceId: inv.id }, select: { id: true } });
        if (exists) continue;
        await prisma.invoice.create({
          data: {
            clientId: client.id,
            amount: inv.amount_paid / 100,
            currency: (inv.currency || "usd").toUpperCase(),
            status: "PAID",
            paidAt: new Date((inv.status_transitions?.paid_at || inv.created) * 1000),
            notes: inv.description || (inv.number ? `Stripe invoice ${inv.number}` : "Imported from Stripe"),
            stripeInvoiceId: inv.id,
            stripeInvoiceUrl: inv.hosted_invoice_url || null,
          },
        });
        res.invoicesImported++;
      }
    } catch (err) {
      res.errors.push(`Customer ${customer.id}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }
}

async function syncCharges(res: SyncResult, since: number | null): Promise<void> {
  const params: Stripe.ChargeListParams = { limit: 100, expand: ["data.balance_transaction"] };
  if (since) params.created = { gte: since };
  const years = new Set<number>();
  for await (const c of deps.stripe().charges.list(params)) {
    if (c.status !== "succeeded") continue;
    res.paymentsSeen++;
    try {
      const customerId = typeof c.customer === "string" ? c.customer : c.customer?.id || null;
      const email = c.billing_details?.email || c.receipt_email || null;
      let clientId: string | null = null;
      if (customerId) clientId = (await prisma.client.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } }))?.id ?? null;
      if (!clientId && email) clientId = (await prisma.client.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } }))?.id ?? null;
      if (!clientId) res.paymentsUnmatched++;
      else await enrich(clientId, { phone: c.billing_details?.phone || null, address: c.billing_details?.address || null, taxId: null });

      const paidAt = new Date(c.created * 1000);
      const taxYear = paidAt.getUTCFullYear();
      years.add(taxYear);
      const currency = c.currency.toUpperCase();
      const amount = fromCents(c.amount);
      const refunded = fromCents(c.amount_refunded);
      const bt = c.balance_transaction && typeof c.balance_transaction === "object" ? (c.balance_transaction as Stripe.BalanceTransaction) : null;
      const settledCurrency = bt?.currency?.toUpperCase() || null;
      let eurGross: number | null = null;
      if (currency === "EUR") eurGross = amount;
      else if (settledCurrency === "EUR") eurGross = fromCents(bt!.amount);
      else {
        const { rate } = await rateToEurOn(currency, paidAt);
        eurGross = rate != null ? round2(amount * rate) : null;
      }
      const eurNet = eurGross != null && amount > 0 ? round2(eurGross * (1 - refunded / amount)) : null;
      const data = {
        customerId,
        clientId,
        paymentIntentId: typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id || null,
        stripeInvoiceId: ((c as unknown as { invoice?: string | { id: string } | null }).invoice && (typeof (c as unknown as { invoice?: unknown }).invoice === "string" ? ((c as unknown as { invoice: string }).invoice) : (c as unknown as { invoice: { id: string } }).invoice.id)) || null,
        amount,
        refunded,
        currency,
        fee: bt ? fromCents(bt.fee) : null,
        settledCurrency,
        settledAmount: bt ? fromCents(bt.amount) : null,
        eurGross,
        eurNet,
        paidAt,
        taxYear,
        description: c.description || c.statement_descriptor || null,
        billingName: c.billing_details?.name || null,
        billingEmail: email,
        receiptUrl: c.receipt_url || null,
        disputed: !!c.disputed,
        syncedAt: new Date(),
      };
      const existing = await prisma.stripePayment.findUnique({ where: { stripeChargeId: c.id }, select: { id: true } });
      if (existing) await prisma.stripePayment.update({ where: { id: existing.id }, data });
      else {
        await prisma.stripePayment.create({ data: { stripeChargeId: c.id, ...data } });
        res.paymentsNew++;
      }
    } catch (err) {
      res.errors.push(`Charge ${c.id}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }
  res.years = [...years].sort();
}

const LIVE = new Set(["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]);

export function isLiveInStripe(status: string | null | undefined): boolean {
  return !!status && LIVE.has(status);
}

function intervalOf(price: Stripe.Price): "MONTHLY" | "QUARTERLY" | "YEARLY" | null {
  const r = price.recurring;
  if (!r) return null;
  if (r.interval === "month" && r.interval_count === 1) return "MONTHLY";
  if (r.interval === "month" && r.interval_count === 3) return "QUARTERLY";
  if (r.interval === "year" && r.interval_count === 1) return "YEARLY";
  return null;
}

/**
 * Drafts a paused plan for each live subscription. Reads only: nothing is
 * cancelled at Stripe and no invoice is issued. The first run sits on the end of
 * the period Stripe already charged for. A plan stays locked until a sync sees
 * its subscription gone, so one client can never be billed by both.
 */
async function syncSubscriptions(res: SyncResult, actor: string): Promise<void> {
  const products = new Map<string, string>();
  const productName = async (id: string): Promise<string> => {
    if (!products.has(id)) products.set(id, (await deps.stripe().products.retrieve(id)).name);
    return products.get(id)!;
  };
  const seen = new Set<string>();
  for await (const sub of deps.stripe().subscriptions.list({ status: "all", limit: 100 })) {
    seen.add(sub.id);
    const existing = await prisma.recurringPlan.findFirst({ where: { stripeSubscriptionId: sub.id }, select: { id: true, status: true, runs: true } });
    const items = sub.items.data;
    const end = new Date(((items[0] as unknown as { current_period_end?: number })?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end ?? sub.start_date) * 1000);
    const day = Math.min(end.getUTCDate(), 28);
    const nextRunAt = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), day));
    if (existing) {
      await prisma.recurringPlan.update({ where: { id: existing.id }, data: { stripeSubStatus: sub.status, ...(existing.status === "PAUSED" && existing.runs === 0 && isLiveInStripe(sub.status) ? { nextRunAt, dayOfMonth: day } : {}) } });
      continue;
    }
    if (!isLiveInStripe(sub.status)) continue;
    res.subscriptionsSeen++;
    try {
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const client = await prisma.client.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true, name: true, company: true, country: true, companyCountry: true, companyState: true } });
      if (!client) throw new Error("no client for this customer yet, run the full sync");
      const interval = intervalOf(items[0].price);
      if (!interval || items.some((i) => intervalOf(i.price) !== interval || i.price.unit_amount == null)) throw new Error("billing cycle or usage pricing needs setting up by hand");
      const lines: Array<{ description: string; qty: number; unitPrice: number }> = [];
      for (const i of items) {
        const pid = typeof i.price.product === "string" ? i.price.product : i.price.product.id;
        lines.push({ description: `${i.price.nickname || (await productName(pid))}, {period}`, qty: i.quantity || 1, unitPrice: fromCents(i.price.unit_amount!) });
      }
      const currency = sub.currency.toUpperCase();
      const template = templateForCountry(guessCountry(client));
      const plan = await createPlan(
        {
          clientId: client.id,
          name: `${lines[0].description.replace(/, \{period\}$/, "")} (from Stripe)`,
          interval,
          dayOfMonth: day,
          startDate: nextRunAt.toISOString().slice(0, 10),
          template,
          language: defaultsForTemplate(template).language,
          currency,
          dueDays: 14,
          items: lines,
          autoSend: true,
          paymentMethod: "BANK",
        },
        actor
      );
      await prisma.recurringPlan.update({ where: { id: plan.id }, data: { status: "PAUSED", nextRunAt, stripeSubscriptionId: sub.id, stripeSubStatus: sub.status } });
      res.plansDrafted++;
    } catch (err) {
      res.errors.push(`Subscription ${sub.id}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }
  // Gone from Stripe altogether: the lock lifts
  await prisma.recurringPlan.updateMany({ where: { stripeSubscriptionId: { not: null, notIn: [...seen] }, stripeSubStatus: { not: "canceled" } }, data: { stripeSubStatus: "canceled" } });
}

/** mode full = everything since the account began; recent = the last 120 days, enough to catch late refunds. */
export async function syncStripeLedger(mode: "full" | "recent", actor: string): Promise<SyncResult> {
  const res: SyncResult = { customersSeen: 0, clientsCreated: 0, clientsLinked: 0, clientsEnriched: 0, invoicesImported: 0, paymentsSeen: 0, paymentsNew: 0, paymentsUnmatched: 0, subscriptionsSeen: 0, plansDrafted: 0, years: [], errors: [], syncedAt: new Date().toISOString(), mode };
  // Each stage stands alone: what succeeds is kept, and what failed is written down
  let stagesOk = true;
  const stage = async (name: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (err) {
      stagesOk = false;
      res.errors.unshift(`${name}: ${err instanceof Error ? err.message : "failed"}`);
    }
  };
  if (mode === "full") await stage("Customers", () => syncCustomers(res));
  await stage("Payments", () => syncCharges(res, mode === "full" ? null : Math.floor(Date.now() / 1000) - 120 * 86400));
  await stage("Subscriptions", () => syncSubscriptions(res, actor));
  const { setSetting } = await import("@/lib/lifecycle/settings");
  // Only a finished full run makes the ledger the source of truth for year totals
  if (mode === "full" && stagesOk) await setSetting("stripe_ledger_full_at", res.syncedAt, actor);
  await setSetting("stripe_ledger_last_sync", { ...res, errors: res.errors.slice(0, 20) }, actor);
  await prisma.activityLog.create({ data: { actor, action: "stripe_ledger_synced", details: `Stripe ${mode} sync: ${res.paymentsSeen} payments (${res.paymentsNew} new), ${res.customersSeen} customers, ${res.clientsCreated} clients created, ${res.clientsEnriched} filled in` } }).catch(() => {});
  return res;
}
