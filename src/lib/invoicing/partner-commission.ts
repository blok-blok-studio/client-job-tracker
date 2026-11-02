import { addDays, addMonths } from "date-fns";
import prisma from "@/lib/prisma";
import { bandedCloseCommission, flatCommission, pillarValuesForContract, previewProjectCommission } from "@/lib/commissions";
import { readGenParams } from "@/lib/contract-send";
import { notifySlack } from "@/lib/slack";
import { rateToEurOn, usdToEur } from "./revenue";

/**
 * Bank-transfer invoices earn partner commission too. Stripe payments record
 * commission from the webhook; a studio invoice records it when the owner
 * marks it paid and picks what the invoice was for (project, brand guide or
 * a plan month). Basis = the invoice's net amount in USD.
 */
export type StudioCommissionKind = "PROJECT" | "BRAND_GUIDE" | "PLAN";

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.blokblokstudio.com";

export async function recordCommissionForStudioInvoice(invoiceId: string, kind: StudioCommissionKind, actor: string): Promise<{ recorded: boolean; reason?: string; amount?: number }> {
  const inv = await prisma.studioInvoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return { recorded: false, reason: "invoice missing" };
  const client = await prisma.client.findUnique({ where: { id: inv.clientId }, select: { id: true, name: true, partnerId: true, partnerRepId: true, closedBy: true } });
  if (!client?.partnerId) return { recorded: false, reason: "client has no partner" };
  const partner = await prisma.partner.findUnique({ where: { id: client.partnerId } });
  if (!partner || !partner.isActive) return { recorded: false, reason: "partner inactive" };

  // Contract invoices use the same pillars as a paid deposit link: full fees, first milestone only
  if (inv.contractId && kind !== "PLAN") return recordContractCommission({ ...inv, contractId: inv.contractId }, client, partner, actor);

  // The agreement: project and brand commission is earned in full on the deposit, on the full fee.
  let basis = Number(inv.subtotal);
  if (kind !== "PLAN") {
    if (inv.milestone === "balance" || /^m[2-9]$/.test(inv.milestone || "")) return { recorded: false, reason: "earned on the deposit" };
    if (inv.milestone === "deposit") basis = basis * 2;
    if (inv.milestone === "m1" && inv.quoteId) {
      const quote = await prisma.quote.findUnique({ where: { id: inv.quoteId }, select: { subtotal: true } });
      if (quote) basis = Number(quote.subtotal);
    }
  }
  if (inv.currency !== "USD") {
    const rate = (await rateToEurOn(inv.currency, inv.paidAt || new Date())).rate;
    if (rate == null) return { recorded: false, reason: `no ECB rate for ${inv.currency}` };
    basis = round2((basis * rate) / (await usdToEur()));
  }
  if (basis <= 0) return { recorded: false, reason: "zero basis" };

  const paidAt = inv.paidAt || new Date();
  const closedByRep = client.closedBy === "PARTNER_REP";
  let calc: { amount: number; blendedRate: number };
  let label: string;
  if (kind === "PROJECT") {
    calc = closedByRep ? bandedCloseCommission(basis, Number(partner.rateProjectClose)) : flatCommission(basis, Number(partner.rateProjectHandoff));
    label = `Project commission (${closedByRep ? "team close" : "handoff"})`;
  } else if (kind === "BRAND_GUIDE") {
    calc = flatCommission(basis, Number(closedByRep ? partner.rateBrandGuideClose : partner.rateBrandGuideHandoff));
    label = `Brand guide commission (${closedByRep ? "team close" : "handoff"})`;
  } else {
    const first = await prisma.commission.findFirst({ where: { clientId: client.id, kind: "PLAN", status: { not: "VOID" } }, orderBy: { eventAt: "asc" }, select: { eventAt: true } });
    if (first && paidAt >= addMonths(first.eventAt, partner.planMonths)) return { recorded: false, reason: `outside the ${partner.planMonths}-month plan window` };
    calc = flatCommission(basis, Number(partner.ratePlan));
    label = "Plan commission";
  }
  if (calc.amount <= 0) return { recorded: false, reason: "rate is zero" };

  const payableBy = addDays(paidAt, partner.payoutDays);
  // Idempotent without a DB unique: one live row per invoice + kind
  const dup = await prisma.commission.findFirst({ where: { studioInvoiceId: inv.id, kind, status: { not: "VOID" } }, select: { id: true } });
  if (dup) return { recorded: false, reason: "already recorded" };
  try {
    await prisma.commission.create({
      data: {
        partnerId: partner.id,
        partnerRepId: client.partnerRepId,
        clientId: client.id,
        kind,
        description: `${label} on $${basis.toLocaleString("en-US")} — invoice ${inv.number} (bank transfer)`,
        basisAmount: basis,
        rate: calc.blendedRate,
        amount: calc.amount,
        closedBy: closedByRep ? "PARTNER_REP" : "OWNER",
        eventAt: paidAt,
        payableBy,
        studioInvoiceId: inv.id,
        createdBy: actor,
      },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") return { recorded: false, reason: "already recorded" };
    throw err;
  }
  await prisma.activityLog
    .create({ data: { clientId: client.id, actor, action: "commission_recorded", details: `Partner commission recorded for ${partner.name} from invoice ${inv.number} — due by ${payableBy.toLocaleDateString("en-US")}` } })
    .catch(() => {});
  await notifySlack(`:handshake: *Partner commission payable* to *${partner.name}* for *${client.name}* (bank-transfer invoice). Due by ${payableBy.toLocaleDateString("en-US")}.\n${APP_URL}/partners/${partner.id}`).catch(() => {});
  return { recorded: true, amount: calc.amount };
}

async function recordContractCommission(
  inv: { id: string; number: string | null; milestone: string | null; paidAt: Date | null; contractId: string },
  client: { id: string; name: string; partnerRepId: string | null; closedBy: "OWNER" | "PARTNER_REP" | null },
  partner: Parameters<typeof previewProjectCommission>[0]["rates"] & { id: string; name: string; payoutDays: number },
  actor: string
): Promise<{ recorded: boolean; reason?: string; amount?: number }> {
  const contract = await prisma.contractSignature.findUnique({ where: { id: inv.contractId }, select: { selectedPackages: true } });
  if (!contract) return { recorded: false, reason: "contract missing" };
  const firstLabel = readGenParams(contract.selectedPackages).paymentSchedule?.[0]?.label || "deposit";
  if ((inv.milestone || firstLabel) !== firstLabel) return { recorded: false, reason: "earned on the deposit" };
  const values = pillarValuesForContract(contract.selectedPackages);
  const closedByRep = client.closedBy === "PARTNER_REP";
  const preview = previewProjectCommission({ projectValue: values.PROJECT, brandGuideValue: values.BRAND_GUIDE, closedByRep, rates: partner });
  const eventAt = inv.paidAt || new Date();
  const payableBy = addDays(eventAt, partner.payoutDays);
  const stage = closedByRep ? "team close" : "handoff";
  const rows = [
    { kind: "PROJECT" as const, label: "Project", value: values.PROJECT, calc: preview.project },
    { kind: "BRAND_GUIDE" as const, label: "Brand guide", value: values.BRAND_GUIDE, calc: preview.brand },
  ].filter((r) => r.value > 0 && r.calc.amount > 0);
  let total = 0;
  for (const r of rows) {
    const dup = await prisma.commission.findFirst({ where: { studioInvoiceId: inv.id, kind: r.kind, status: { not: "VOID" } }, select: { id: true } });
    if (dup) continue;
    await prisma.commission.create({
      data: {
        partnerId: partner.id,
        partnerRepId: client.partnerRepId,
        clientId: client.id,
        kind: r.kind,
        description: `${r.label} commission (${stage}) on $${r.value.toLocaleString("en-US")} — ${client.name}`,
        basisAmount: r.value,
        rate: r.calc.blendedRate,
        amount: r.calc.amount,
        closedBy: closedByRep ? "PARTNER_REP" : "OWNER",
        eventAt,
        payableBy,
        studioInvoiceId: inv.id,
        createdBy: actor,
      },
    });
    total += r.calc.amount;
  }
  if (!total) return { recorded: false, reason: rows.length ? "already recorded" : "nothing commissionable" };
  await prisma.activityLog.create({ data: { clientId: client.id, actor, action: "commission_recorded", details: `Partner commission recorded for ${partner.name} from invoice ${inv.number} — due by ${payableBy.toLocaleDateString("en-US")}` } }).catch(() => {});
  await notifySlack(`:handshake: *Partner commission payable* to *${partner.name}* for *${client.name}* (${stage}). Due by ${payableBy.toLocaleDateString("en-US")}.\n${APP_URL}/partners/${partner.id}`).catch(() => {});
  return { recorded: true, amount: round2(total) };
}

/** Best guess when nobody chose: a plan invoice is a plan month, otherwise project unless it reads as a brand guide. */
export function inferCommissionKind(inv: { planId: string | null; items: unknown }): StudioCommissionKind {
  if (inv.planId) return "PLAN";
  const text = JSON.stringify(inv.items || "").toLowerCase();
  return text.includes("brand") ? "BRAND_GUIDE" : "PROJECT";
}

/** Payment undone: void the commission rows that invoice created, unless already paid out. */
export async function voidCommissionsForStudioInvoice(invoiceId: string, actor: string): Promise<{ voided: number; keptPaid: number; clawedBack: number }> {
  const rows = await prisma.commission.findMany({ where: { studioInvoiceId: invoiceId, reversesId: null } });
  const payable = rows.filter((r) => r.status === "PAYABLE");
  if (payable.length) {
    await prisma.commission.updateMany({ where: { id: { in: payable.map((r) => r.id) } }, data: { status: "VOID" } });
    await prisma.activityLog
      .create({ data: { clientId: rows[0].clientId, actor, action: "commission_voided", details: `${payable.length} partner commission row(s) voided: invoice payment undone` } })
      .catch(() => {});
  }
  // Already paid out: nothing to void, so the money comes back through the next payout
  const paidOut = rows.filter((r) => r.status === "PAID");
  let clawedBack = 0;
  for (const r of paidOut) {
    const done = await prisma.commission.findFirst({ where: { reversesId: r.id, status: { not: "VOID" } }, select: { id: true } });
    if (done) continue;
    await prisma.commission.create({
      data: {
        partnerId: r.partnerId,
        partnerRepId: r.partnerRepId,
        clientId: r.clientId,
        kind: r.kind,
        description: `Clawback: ${r.description}`.slice(0, 300),
        basisAmount: r.basisAmount,
        rate: r.rate,
        amount: -Number(r.amount),
        closedBy: r.closedBy,
        eventAt: new Date(),
        payableBy: new Date(),
        studioInvoiceId: invoiceId,
        reversesId: r.id,
        createdBy: actor,
      },
    });
    clawedBack++;
  }
  return { voided: payable.length, keptPaid: paidOut.length, clawedBack };
}

/** For the owner UI: does this invoice's client have a partner, and was commission already recorded? */
export async function partnerContextForInvoice(invoiceId: string) {
  const inv = await prisma.studioInvoice.findUnique({ where: { id: invoiceId }, select: { clientId: true } });
  if (!inv) return null;
  const client = await prisma.client.findUnique({ where: { id: inv.clientId }, select: { partnerId: true, closedBy: true } });
  if (!client?.partnerId) return null;
  const partner = await prisma.partner.findUnique({ where: { id: client.partnerId }, select: { id: true, name: true } });
  if (!partner) return null;
  const rows = await prisma.commission.findMany({ where: { studioInvoiceId: invoiceId }, select: { id: true, kind: true, amount: true, status: true } });
  return { partner, closedBy: client.closedBy, commissions: rows.map((r) => ({ ...r, amount: Number(r.amount) })) };
}
