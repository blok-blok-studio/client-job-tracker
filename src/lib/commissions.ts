import { addDays, addMonths } from "date-fns";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { SERVICE_PACKAGES, ADDON_PACKAGES } from "@/lib/contract-templates";
import { readGenParams } from "@/lib/contract-send";
import { commissionPillarFor } from "@/lib/partner-catalog";
import { notifySlack } from "@/lib/slack";

/**
 * Sales-partner commission ledger.
 *
 * Rows are written from Stripe webhooks, never by hand in the normal flow:
 *  - the client's first project payment (the deposit) earns the FULL project
 *    commission at once (agreed with MBMedSolutions 30 Oct 2026: reps are paid
 *    fast; refunds claw it back)
 *  - every paid plan month earns the plan rate, for `planMonths` calendar
 *    months from the first eligible plan payment
 *  - refunds write negative rows against the commission they reverse
 *
 * Every row carries the Stripe object that produced it and is unique on it,
 * so a redelivered webhook can never double-pay.
 *
 * Queries are kept flat (no nested include/select): the generated Prisma
 * types for this schema are big enough that nested selections can exhaust
 * TypeScript's instantiation budget and lose their result types.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

type PartnerRates = {
  rateProjectHandoff: Prisma.Decimal | number;
  rateProjectClose: Prisma.Decimal | number;
  rateBrandGuideHandoff: Prisma.Decimal | number;
  rateBrandGuideClose: Prisma.Decimal | number;
  ratePlan: Prisma.Decimal | number;
  planMonths: number;
  payoutDays: number;
};

const n = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Team-close project commission is banded: the headline rate on the first
 * $15,000, 10% on $15,000–$50,000, 5% above $50,000. Handoff closes are flat.
 */
export const CLOSE_BANDS = [
  { upTo: 15_000, rate: null as number | null }, // partner's headline close rate
  { upTo: 50_000, rate: 10 },
  { upTo: Number.POSITIVE_INFINITY, rate: 5 },
];

export function bandedCloseCommission(value: number, headlineRate: number): { amount: number; blendedRate: number } {
  let remaining = value;
  let floor = 0;
  let amount = 0;
  for (const band of CLOSE_BANDS) {
    const slice = Math.max(0, Math.min(remaining, band.upTo - floor));
    if (slice <= 0) break;
    amount += slice * ((band.rate ?? headlineRate) / 100);
    remaining -= slice;
    floor = band.upTo;
  }
  amount = round2(amount);
  return { amount, blendedRate: value > 0 ? round2((amount / value) * 100) : 0 };
}

export function flatCommission(value: number, rate: number): { amount: number; blendedRate: number } {
  return { amount: round2(value * (rate / 100)), blendedRate: rate };
}

/** Preview the commission a deal would earn — used by the portal and the kit, no DB writes. */
export function previewProjectCommission(opts: {
  projectValue: number;
  brandGuideValue: number;
  closedByRep: boolean;
  rates: PartnerRates;
}) {
  const { projectValue, brandGuideValue, closedByRep, rates } = opts;
  const project = closedByRep
    ? bandedCloseCommission(projectValue, n(rates.rateProjectClose))
    : flatCommission(projectValue, n(rates.rateProjectHandoff));
  const brand = flatCommission(
    brandGuideValue,
    closedByRep ? n(rates.rateBrandGuideClose) : n(rates.rateBrandGuideHandoff)
  );
  return { project, brand, total: round2(project.amount + brand.amount) };
}

/** Split a contract's one-time USD value into the commission pillars. */
export function pillarValuesForContract(selectedPackages: unknown): { PROJECT: number; BRAND_GUIDE: number } {
  const params = readGenParams(selectedPackages);
  const out = { PROJECT: 0, BRAND_GUIDE: 0 };
  const items = [
    ...SERVICE_PACKAGES.filter((p) => params.packages.includes(p.id)),
    ...ADDON_PACKAGES.filter((a) => params.addons.includes(a.id)),
  ];
  for (const item of items) {
    if (item.recurring) continue;
    const price = params.packageCustomizations?.[item.id]?.priceOverride ?? item.price;
    const pillar = commissionPillarFor(item.id);
    if (pillar === "BRAND_GUIDE") out.BRAND_GUIDE += price;
    else if (pillar === "PROJECT") out.PROJECT += price;
  }
  for (const c of params.customItems) {
    if (!c.recurring) out.PROJECT += c.price;
  }
  return { PROJECT: round2(out.PROJECT), BRAND_GUIDE: round2(out.BRAND_GUIDE) };
}

async function createRowIgnoringDuplicate(data: Prisma.CommissionUncheckedCreateInput): Promise<boolean> {
  try {
    await prisma.commission.create({ data });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
}

const attributionSelect = { id: true, name: true, partnerId: true, partnerRepId: true, closedBy: true } as const;

/**
 * A one-time Checkout just completed. If it is the FIRST milestone of a
 * partner-attributed client's contract, record the full project commission.
 * Later milestones (the completion balance) earn nothing extra: it was paid
 * on the deposit. Ad-hoc payment links with no contract are not commissionable
 * automatically — the owner can add an adjustment by hand.
 */
export async function recordProjectCommissionsForPaymentLink(paymentLinkId: string): Promise<void> {
  const link = await prisma.paymentLink.findUnique({ where: { id: paymentLinkId } });
  if (!link || link.recurring || !link.contractId) return;

  const [client, contract] = await Promise.all([
    prisma.client.findUnique({ where: { id: link.clientId }, select: attributionSelect }),
    prisma.contractSignature.findUnique({ where: { id: link.contractId }, select: { id: true, selectedPackages: true } }),
  ]);
  if (!client || !client.partnerId || !contract) return;

  const params = readGenParams(contract.selectedPackages);
  const firstMilestone = params.paymentSchedule?.[0]?.label || "deposit";
  if ((link.milestone || "deposit") !== firstMilestone) return;

  const partner = await prisma.partner.findUnique({ where: { id: client.partnerId } });
  if (!partner || !partner.isActive) return;

  const values = pillarValuesForContract(contract.selectedPackages);
  const closedByRep = client.closedBy === "PARTNER_REP";
  const preview = previewProjectCommission({
    projectValue: values.PROJECT,
    brandGuideValue: values.BRAND_GUIDE,
    closedByRep,
    rates: partner,
  });

  const eventAt = link.paidAt || new Date();
  const payableBy = addDays(eventAt, partner.payoutDays);
  const stage = closedByRep ? "team close" : "handoff";
  let created = 0;

  if (values.PROJECT > 0 && preview.project.amount > 0) {
    const ok = await createRowIgnoringDuplicate({
      partnerId: partner.id,
      partnerRepId: client.partnerRepId,
      clientId: client.id,
      kind: "PROJECT",
      description: `Project commission (${stage}) on $${values.PROJECT.toLocaleString()} — ${client.name}`,
      basisAmount: values.PROJECT,
      rate: preview.project.blendedRate,
      amount: preview.project.amount,
      closedBy: closedByRep ? "PARTNER_REP" : "OWNER",
      eventAt,
      payableBy,
      paymentLinkId: link.id,
      createdBy: "stripe",
    });
    if (ok) created++;
  }
  if (values.BRAND_GUIDE > 0 && preview.brand.amount > 0) {
    const ok = await createRowIgnoringDuplicate({
      partnerId: partner.id,
      partnerRepId: client.partnerRepId,
      clientId: client.id,
      kind: "BRAND_GUIDE",
      description: `Brand guide commission (${stage}) on $${values.BRAND_GUIDE.toLocaleString()} — ${client.name}`,
      basisAmount: values.BRAND_GUIDE,
      rate: preview.brand.blendedRate,
      amount: preview.brand.amount,
      closedBy: closedByRep ? "PARTNER_REP" : "OWNER",
      eventAt,
      payableBy,
      paymentLinkId: link.id,
      createdBy: "stripe",
    });
    if (ok) created++;
  }

  if (created > 0) {
    await prisma.activityLog.create({
      data: {
        clientId: client.id,
        actor: "stripe",
        action: "commission_recorded",
        details: `Partner commission recorded for ${partner.name} (${stage}) — due by ${payableBy.toLocaleDateString("en-US")}`,
      },
    }).catch(() => {});
    // No amounts: the channel is team-visible, finances stay owner-only
    await notifySlack(
      `:handshake: *Partner commission payable* to *${partner.name}* for *${client.name}* (${stage}). Due by ${payableBy.toLocaleDateString("en-US")}.\n${APP_URL}/partners/${partner.id}`
    ).catch(() => {});
  }
}

/**
 * A subscription invoice was paid. If the subscription belongs to a
 * partner-attributed client and we are inside the plan window, record the
 * plan commission for that month.
 */
export async function recordPlanCommissionForInvoice(opts: {
  stripeInvoiceId: string;
  stripeSubscriptionId: string;
  amountPaidCents: number;
  paidAt: Date;
}): Promise<void> {
  const { stripeInvoiceId, stripeSubscriptionId, amountPaidCents, paidAt } = opts;
  if (amountPaidCents <= 0) return;

  const link = await prisma.paymentLink.findFirst({ where: { stripeSubscriptionId } });
  if (!link) return;
  const client = await prisma.client.findUnique({ where: { id: link.clientId }, select: attributionSelect });
  if (!client || !client.partnerId) return;

  const partner = await prisma.partner.findUnique({ where: { id: client.partnerId } });
  if (!partner || !partner.isActive) return;

  // One recurring window per client: planMonths calendar months from the
  // first eligible plan payment. Upgrades and restarts do not reset it.
  const first = await prisma.commission.findFirst({
    where: { clientId: client.id, kind: "PLAN", status: { not: "VOID" } },
    orderBy: { eventAt: "asc" },
    select: { eventAt: true },
  });
  if (first && paidAt >= addMonths(first.eventAt, partner.planMonths)) return;

  const basis = round2(amountPaidCents / 100);
  const { amount, blendedRate } = flatCommission(basis, n(partner.ratePlan));
  if (amount <= 0) return;

  const payableBy = addDays(paidAt, partner.payoutDays);
  const ok = await createRowIgnoringDuplicate({
    partnerId: partner.id,
    partnerRepId: client.partnerRepId,
    clientId: client.id,
    kind: "PLAN",
    description: `Plan commission on $${basis.toLocaleString()} — ${link.description}`,
    basisAmount: basis,
    rate: blendedRate,
    amount,
    closedBy: client.closedBy,
    eventAt: paidAt,
    payableBy,
    paymentLinkId: link.id,
    stripeInvoiceId,
    createdBy: "stripe",
  });
  if (ok) {
    await prisma.activityLog.create({
      data: {
        clientId: client.id,
        actor: "stripe",
        action: "commission_recorded",
        details: `Partner plan commission recorded for ${partner.name} — due by ${payableBy.toLocaleDateString("en-US")}`,
      },
    }).catch(() => {});
  }
}

/**
 * A charge was (partly) refunded. Claw back the same fraction of every
 * commission that charge earned. Works for deposits (via the Checkout's
 * payment intent) and plan months (via the subscription invoice).
 * `amountRefundedCents` is the charge's cumulative total, so a second partial
 * refund only writes the delta.
 */
export async function recordRefundClawback(opts: {
  chargeId: string;
  paymentIntentId: string | null;
  invoiceId: string | null;
  chargeAmountCents: number;
  amountRefundedCents: number;
}): Promise<void> {
  const { chargeId, paymentIntentId, invoiceId, chargeAmountCents, amountRefundedCents } = opts;
  if (amountRefundedCents <= 0 || chargeAmountCents <= 0) return;
  const fraction = Math.min(1, amountRefundedCents / chargeAmountCents);

  const where: Prisma.CommissionWhereInput[] = [];
  if (invoiceId) where.push({ stripeInvoiceId: invoiceId, kind: "PLAN" });
  if (paymentIntentId) {
    const links = await prisma.paymentLink.findMany({
      where: { stripePaymentIntentId: paymentIntentId },
      select: { id: true },
    });
    if (links.length > 0) {
      where.push({ kind: { in: ["PROJECT", "BRAND_GUIDE"] }, paymentLinkId: { in: links.map((l) => l.id) } });
    }
  }
  if (where.length === 0) return;

  const originals = await prisma.commission.findMany({
    where: { OR: where, amount: { gt: 0 }, status: { not: "VOID" } },
  });
  if (originals.length === 0) return;

  const [reversals, clients] = await Promise.all([
    prisma.commission.findMany({
      where: { reversesId: { in: originals.map((o) => o.id) } },
      select: { reversesId: true, amount: true },
    }),
    prisma.client.findMany({
      where: { id: { in: [...new Set(originals.map((o) => o.clientId))] } },
      select: { id: true, name: true },
    }),
  ]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  for (const c of originals) {
    const target = round2(n(c.amount) * fraction);
    const already = round2(
      reversals.filter((r) => r.reversesId === c.id).reduce((s, r) => s + Math.abs(n(r.amount)), 0)
    );
    const delta = round2(target - already);
    if (delta <= 0.009) continue;

    await createRowIgnoringDuplicate({
      partnerId: c.partnerId,
      partnerRepId: c.partnerRepId,
      clientId: c.clientId,
      kind: "ADJUSTMENT",
      description: `Refund clawback (${Math.round(fraction * 100)}% of ${c.kind.toLowerCase().replace("_", " ")} commission) — ${clientName.get(c.clientId) || "client"}`,
      basisAmount: round2(n(c.basisAmount) * fraction),
      rate: c.rate,
      amount: -delta,
      closedBy: c.closedBy,
      eventAt: new Date(),
      payableBy: null,
      paymentLinkId: null,
      stripeRefundId: `${chargeId}@${amountRefundedCents}`,
      reversesId: c.id,
      createdBy: "stripe",
    });
  }

  const partner = await prisma.partner.findUnique({ where: { id: originals[0].partnerId }, select: { id: true, name: true } });
  await notifySlack(
    `:leftwards_arrow_with_hook: *Refund on a partner deal* — *${clientName.get(originals[0].clientId) || "client"}*. Commission clawback recorded for *${partner?.name || "partner"}*.\n${APP_URL}/partners/${partner?.id || ""}`
  ).catch(() => {});
}

/** Ledger totals for a partner. */
export async function partnerLedgerTotals(partnerId: string) {
  const rows = await prisma.commission.findMany({
    where: { partnerId, status: { not: "VOID" } },
    select: { amount: true, status: true },
  });
  let payable = 0;
  let paid = 0;
  for (const r of rows) {
    if (r.status === "PAYABLE") payable += n(r.amount);
    else if (r.status === "PAID") paid += n(r.amount);
  }
  return { payable: round2(payable), paid: round2(paid), lifetime: round2(payable + paid) };
}

/** "2026-11" style month key used to group statements. */
export function statementMonth(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
