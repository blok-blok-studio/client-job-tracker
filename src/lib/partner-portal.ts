import prisma from "@/lib/prisma";

/**
 * Shared helpers for the token-scoped sales-partner portal.
 *
 * A rep's token is their identity: no login, no dashboard. The token resolves
 * to a PartnerRep (and its Partner); admins (the partner's owner) see every
 * rep's deals and the commission statement, ordinary reps see only their own
 * registrations and never any money.
 *
 * Queries here are deliberately flat (no nested include/select trees): the
 * generated Prisma types for this schema are large enough that deeply nested
 * selections can exhaust TypeScript's instantiation budget and silently lose
 * their result types. Separate lookups joined in memory stay typed.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

export function partnerPortalUrl(token: string): string {
  return `${APP_URL}/partner/${token}`;
}

export async function findRepByToken(token: string) {
  if (!token || token.length < 16) return null;
  const rep = await prisma.partnerRep.findUnique({ where: { token } });
  if (!rep || !rep.isActive) return null;
  const partner = await prisma.partner.findUnique({ where: { id: rep.partnerId } });
  if (!partner || !partner.isActive) return null;
  return { ...rep, partner };
}

export type DealStage =
  | "registered"
  | "contract_sent"
  | "signed"
  | "deposit_paid"
  | "balance_paid"
  | "live"
  | "lost";

export const STAGE_LABELS: Record<DealStage, string> = {
  registered: "Registered",
  contract_sent: "Contract sent",
  signed: "Contract signed",
  deposit_paid: "Deposit paid",
  balance_paid: "Paid in full",
  live: "Live",
  lost: "Closed, no sale",
};

interface ContractLite {
  status: string;
  kind: string;
}
interface LinkLite {
  milestone: string | null;
  status: string;
  recurring: boolean;
}

/**
 * Where a partner-registered practice sits in the funnel, derived from the
 * records the pipeline already keeps (contracts, payment links, launch date).
 */
export function dealStage(client: {
  type: string;
  launchDate: Date | null;
  contracts: ContractLite[];
  paymentLinks: LinkLite[];
}): DealStage {
  if (client.type === "ARCHIVED") return "lost";
  if (client.launchDate) return "live";
  const paidOneTime = client.paymentLinks.filter((l) => !l.recurring && l.status === "PAID");
  if (paidOneTime.some((l) => l.milestone === "completion")) return "balance_paid";
  if (paidOneTime.length > 0) return "deposit_paid";
  const service = client.contracts.filter((c) => c.kind === "SERVICE_AGREEMENT");
  if (service.some((c) => c.status === "SIGNED")) return "signed";
  if (service.some((c) => c.status === "PENDING")) return "contract_sent";
  return "registered";
}

export interface PartnerDeal {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  stage: DealStage;
  stageLabel: string;
  closedBy: "OWNER" | "PARTNER_REP" | null;
  registeredAt: Date;
  rep: { id: string; name: string } | null;
  packages: string[];
  contractUrl: string | null;
  contractStatus: string | null;
  depositUrl: string | null;
  depositPaid: boolean;
  planDescription: string | null;
  planStatus: string | null;
}

/** The deal list a rep (or the partner admin) sees. */
export async function partnerDeals(partnerId: string, repId: string | null): Promise<PartnerDeal[]> {
  const clients = await prisma.client.findMany({
    where: { partnerId, ...(repId ? { partnerRepId: repId } : {}) },
    orderBy: { partnerRegisteredAt: "desc" },
    select: {
      id: true,
      name: true,
      company: true,
      email: true,
      phone: true,
      type: true,
      launchDate: true,
      closedBy: true,
      partnerRepId: true,
      partnerRegisteredAt: true,
      createdAt: true,
    },
  });
  if (clients.length === 0) return [];
  const ids = clients.map((c) => c.id);

  const [contracts, links, reps] = await Promise.all([
    prisma.contractSignature.findMany({
      where: { clientId: { in: ids }, kind: "SERVICE_AGREEMENT" },
      orderBy: { createdAt: "desc" },
      select: { id: true, clientId: true, status: true, kind: true, token: true, createdAt: true, selectedPackages: true },
    }),
    prisma.paymentLink.findMany({
      where: { clientId: { in: ids } },
      orderBy: { createdAt: "asc" },
      select: { clientId: true, milestone: true, status: true, recurring: true, stripeUrl: true, amount: true, description: true },
    }),
    prisma.partnerRep.findMany({ where: { partnerId }, select: { id: true, name: true } }),
  ]);

  const repById = new Map(reps.map((r) => [r.id, r]));

  return clients.map((c) => {
    const myContracts = contracts.filter((k) => k.clientId === c.id);
    const myLinks = links.filter((l) => l.clientId === c.id);
    const stage = dealStage({ type: c.type, launchDate: c.launchDate, contracts: myContracts, paymentLinks: myLinks });
    const latest = myContracts[0];
    const live = latest && latest.status !== "EXPIRED" ? latest : null;
    const deposit = myLinks.find((l) => !l.recurring && (l.milestone === "deposit" || !l.milestone));
    const plan = myLinks.find((l) => l.recurring);
    const packages = latest ? ((latest.selectedPackages as { packages?: string[] } | null)?.packages ?? []) : [];
    const rep = c.partnerRepId ? repById.get(c.partnerRepId) || null : null;
    return {
      id: c.id,
      name: c.name,
      company: c.company,
      email: c.email,
      phone: c.phone,
      stage,
      stageLabel: STAGE_LABELS[stage],
      closedBy: c.closedBy,
      registeredAt: c.partnerRegisteredAt || c.createdAt,
      rep,
      packages,
      contractUrl: live ? `${APP_URL}/c/${live.token}` : null,
      contractStatus: live?.status || null,
      depositUrl: deposit && deposit.status === "PENDING" ? deposit.stripeUrl : null,
      depositPaid: deposit?.status === "PAID",
      planDescription: plan?.description || null,
      planStatus: plan?.status || null,
    };
  });
}

/** Ledger rows with the names the UI needs, joined without nested includes. */
export async function partnerLedgerRows(partnerId: string, status?: "PAYABLE" | "PAID" | "VOID" | null, take = 1000) {
  const rows = await prisma.commission.findMany({
    where: { partnerId, ...(status ? { status } : { status: { not: "VOID" } }) },
    orderBy: { eventAt: "desc" },
    take,
  });
  const clientIds = [...new Set(rows.map((r) => r.clientId))];
  const repIds = [...new Set(rows.map((r) => r.partnerRepId).filter((v): v is string => !!v))];
  const payoutIds = [...new Set(rows.map((r) => r.payoutId).filter((v): v is string => !!v))];
  const [clients, reps, payouts] = await Promise.all([
    clientIds.length ? prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true, company: true } }) : [],
    repIds.length ? prisma.partnerRep.findMany({ where: { id: { in: repIds } }, select: { id: true, name: true } }) : [],
    payoutIds.length
      ? prisma.commissionPayout.findMany({ where: { id: { in: payoutIds } }, select: { id: true, stripeTransferId: true, createdAt: true } })
      : [],
  ]);
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const repById = new Map(reps.map((r) => [r.id, r]));
  const payoutById = new Map(payouts.map((p) => [p.id, p]));

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    description: r.description,
    basisAmount: Number(r.basisAmount),
    rate: Number(r.rate),
    amount: Number(r.amount),
    status: r.status,
    closedBy: r.closedBy,
    eventAt: r.eventAt,
    payableBy: r.payableBy,
    paidAt: r.paidAt,
    payoutId: r.payoutId,
    client: clientById.get(r.clientId) || { id: r.clientId, name: "Unknown", company: null },
    rep: r.partnerRepId ? repById.get(r.partnerRepId)?.name || null : null,
    partnerRep: r.partnerRepId ? repById.get(r.partnerRepId) || null : null,
    payout: r.payoutId ? payoutById.get(r.payoutId) || null : null,
    createdBy: r.createdBy,
    reversesId: r.reversesId,
  }));
}

/** Payout runs with how many ledger rows each one covered. */
export async function partnerPayoutRows(partnerId: string, take = 100) {
  const payouts = await prisma.commissionPayout.findMany({
    where: { partnerId },
    orderBy: { createdAt: "desc" },
    take,
  });
  if (payouts.length === 0) return [];
  const paidRows = await prisma.commission.findMany({
    where: { payoutId: { in: payouts.map((p) => p.id) } },
    select: { payoutId: true },
  });
  const countById = new Map<string, number>();
  for (const r of paidRows) if (r.payoutId) countById.set(r.payoutId, (countById.get(r.payoutId) || 0) + 1);
  return payouts.map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    currency: p.currency,
    stripeTransferId: p.stripeTransferId,
    note: p.note,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    items: countById.get(p.id) || 0,
  }));
}
