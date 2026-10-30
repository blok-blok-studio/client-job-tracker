import type Stripe from "stripe";
import prisma from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { notifySlack } from "@/lib/slack";

/**
 * Paying a sales partner through Stripe Connect.
 *
 * The partner onboards as a Connect Express account (Stripe collects their
 * KYC and bank details; we never hold them). A payout run nets every PAYABLE
 * ledger row — positives and clawbacks — and moves the net in ONE transfer
 * from our Stripe balance to their account. Every row in the run is stamped
 * with the payout so the statement and Stripe agree to the cent.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

export class PayoutError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Create the Express account if needed and return a hosted onboarding link. */
export async function startConnectOnboarding(partnerId: string): Promise<{ url: string; accountId: string }> {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner) throw new PayoutError("Partner not found", 404);

  const stripe = getStripe();
  let accountId = partner.stripeConnectAccountId;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: partner.country || "US",
      email: partner.email || undefined,
      business_type: "company",
      capabilities: { transfers: { requested: true } },
      // Transfers-only account: the partner never takes payments through us.
      // The recipient agreement is also what lets a platform outside the US
      // pay a US entity.
      tos_acceptance: { service_agreement: "recipient" },
      business_profile: {
        name: partner.legalName || partner.name,
        product_description: "Sales partner commissions from Blok Blok Studio LLC",
      },
      metadata: { partnerId: partner.id, partnerName: partner.name },
    });
    accountId = account.id;
    await prisma.partner.update({ where: { id: partner.id }, data: { stripeConnectAccountId: accountId } });
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${APP_URL}/api/partners/${partner.id}/connect/return?refresh=1`,
    return_url: `${APP_URL}/api/partners/${partner.id}/connect/return`,
  });

  return { url: link.url, accountId };
}

/** Pull the live account state from Stripe and store whether payouts can flow. */
export async function refreshConnectStatus(partnerId: string): Promise<{
  onboarded: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  requirementsDue: string[];
}> {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner) throw new PayoutError("Partner not found", 404);
  if (!partner.stripeConnectAccountId) {
    return { onboarded: false, detailsSubmitted: false, payoutsEnabled: false, requirementsDue: [] };
  }

  const account: Stripe.Account = await getStripe().accounts.retrieve(partner.stripeConnectAccountId);
  const detailsSubmitted = !!account.details_submitted;
  const payoutsEnabled = !!account.payouts_enabled;
  const transfersActive = account.capabilities?.transfers === "active";
  const onboarded = detailsSubmitted && payoutsEnabled && transfersActive;

  if (onboarded !== partner.connectOnboarded) {
    await prisma.partner.update({ where: { id: partner.id }, data: { connectOnboarded: onboarded } });
  }

  return {
    onboarded,
    detailsSubmitted,
    payoutsEnabled,
    requirementsDue: account.requirements?.currently_due || [],
  };
}

/** Hosted Express dashboard link so the partner can see their own payouts in Stripe. */
export async function connectDashboardLink(partnerId: string): Promise<string> {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner?.stripeConnectAccountId) throw new PayoutError("Partner is not connected to Stripe yet");
  const login = await getStripe().accounts.createLoginLink(partner.stripeConnectAccountId);
  return login.url;
}

export interface PayoutPreview {
  rows: Array<{ id: string; amount: number; description: string; eventAt: Date; kind: string }>;
  gross: number;
  clawbacks: number;
  net: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** What a payout run would send right now. */
export async function previewPayout(partnerId: string): Promise<PayoutPreview> {
  const rows = await prisma.commission.findMany({
    where: { partnerId, status: "PAYABLE" },
    orderBy: { eventAt: "asc" },
    select: { id: true, amount: true, description: true, eventAt: true, kind: true },
  });
  let gross = 0;
  let clawbacks = 0;
  for (const r of rows) {
    const a = Number(r.amount);
    if (a >= 0) gross += a;
    else clawbacks += a;
  }
  return {
    rows: rows.map((r) => ({ ...r, amount: Number(r.amount) })),
    gross: round2(gross),
    clawbacks: round2(clawbacks),
    net: round2(gross + clawbacks),
  };
}

/**
 * Net every PAYABLE row and transfer the result. If the net is zero or
 * negative nothing is sent and the rows stay open: the clawback carries
 * forward until future commissions cover it.
 */
export async function runPayout(partnerId: string, by: string, note?: string) {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner) throw new PayoutError("Partner not found", 404);
  if (!partner.stripeConnectAccountId) throw new PayoutError("Partner has not been connected to Stripe yet");

  const status = await refreshConnectStatus(partnerId);
  if (!status.onboarded) {
    throw new PayoutError(
      status.detailsSubmitted
        ? "Stripe has not enabled payouts for this partner yet (verification pending)."
        : "The partner has not finished Stripe onboarding."
    );
  }

  const preview = await previewPayout(partnerId);
  if (preview.rows.length === 0) throw new PayoutError("Nothing is payable right now");
  if (preview.net <= 0) {
    throw new PayoutError(
      `Net payable is $${preview.net.toFixed(2)}: clawbacks exceed commissions, so nothing is sent. The balance carries forward.`
    );
  }

  const amountCents = Math.round(preview.net * 100);
  const stripe = getStripe();

  // Create the payout record first so the transfer carries our ID, then stamp
  // the rows. If the transfer fails the record is removed and nothing changes.
  const payout = await prisma.commissionPayout.create({
    data: {
      partnerId,
      amount: preview.net,
      currency: "usd",
      note: note || null,
      createdBy: by,
    },
  });

  let transfer: Stripe.Transfer;
  try {
    transfer = await stripe.transfers.create(
      {
        amount: amountCents,
        currency: "usd",
        destination: partner.stripeConnectAccountId,
        description: `Blok Blok Studio commissions — ${preview.rows.length} item${preview.rows.length === 1 ? "" : "s"}`,
        transfer_group: payout.id,
        metadata: {
          partnerId,
          payoutId: payout.id,
          commissionIds: preview.rows.map((r) => r.id).join(",").slice(0, 490),
        },
      },
      { idempotencyKey: `payout_${payout.id}` }
    );
  } catch (err) {
    await prisma.commissionPayout.delete({ where: { id: payout.id } }).catch(() => {});
    const msg = err instanceof Error ? err.message : "Stripe transfer failed";
    throw new PayoutError(`Stripe transfer failed: ${msg}`, 502);
  }

  await prisma.$transaction([
    prisma.commissionPayout.update({
      where: { id: payout.id },
      data: { stripeTransferId: transfer.id },
    }),
    prisma.commission.updateMany({
      where: { id: { in: preview.rows.map((r) => r.id) }, status: "PAYABLE" },
      data: { status: "PAID", paidAt: new Date(), payoutId: payout.id },
    }),
  ]);

  await prisma.activityLog.create({
    data: {
      actor: by,
      action: "partner_payout_sent",
      details: `Commission payout sent to ${partner.name}: ${preview.rows.length} items, Stripe transfer ${transfer.id}`,
    },
  }).catch(() => {});

  await notifySlack(
    `:money_with_wings: *Partner payout sent* to *${partner.name}* (${preview.rows.length} items).\n${APP_URL}/partners/${partner.id}`
  ).catch(() => {});

  return { payoutId: payout.id, transferId: transfer.id, amount: preview.net, items: preview.rows.length };
}
