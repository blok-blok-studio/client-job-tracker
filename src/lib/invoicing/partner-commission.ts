import { addDays, addMonths } from "date-fns";
import prisma from "@/lib/prisma";
import { bandedCloseCommission, flatCommission } from "@/lib/commissions";
import { notifySlack } from "@/lib/slack";
import { usdToEur } from "./revenue";

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

  let basis = Number(inv.subtotal);
  if (inv.currency === "EUR") basis = round2(basis / (await usdToEur()));
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

/** Payment undone: void the commission rows that invoice created, unless already paid out. */
export async function voidCommissionsForStudioInvoice(invoiceId: string, actor: string): Promise<{ voided: number; keptPaid: number }> {
  const rows = await prisma.commission.findMany({ where: { studioInvoiceId: invoiceId }, select: { id: true, status: true, clientId: true } });
  const payable = rows.filter((r) => r.status === "PAYABLE");
  if (payable.length) {
    await prisma.commission.updateMany({ where: { id: { in: payable.map((r) => r.id) } }, data: { status: "VOID" } });
    await prisma.activityLog
      .create({ data: { clientId: rows[0].clientId, actor, action: "commission_voided", details: `${payable.length} partner commission row(s) voided: invoice payment undone` } })
      .catch(() => {});
  }
  return { voided: payable.length, keptPaid: rows.filter((r) => r.status === "PAID").length };
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
