import prisma from "@/lib/prisma";

/**
 * One list of all money: our invoices, every Stripe payment, and money out
 * (contractor invoices, partner payouts). Amounts per year follow the date the
 * money moved, which is how a freelancer's income is counted (Zufluss). Open
 * invoices appear by issue date but add nothing to a year's income.
 */
export interface TrackerRow {
  id: string;
  source: "invoice" | "stripe";
  date: string; // YYYY-MM-DD: paid date, else issue date
  year: number;
  reference: string;
  clientId: string | null;
  client: string;
  description: string;
  currency: string;
  amount: number;
  refunded: number;
  eur: number | null; // counted toward income; null when not received
  fee: number | null;
  status: string; // PAID | OPEN | OVERDUE | VOID | REFUNDED | PARTLY REFUNDED | DISPUTED
  method: string;
  vat: string;
  vatAmount: number;
  href: string | null;
}

export interface CostRow {
  id: string;
  kind: "contractor" | "partner";
  date: string;
  year: number;
  payee: string;
  reference: string;
  currency: string;
  amount: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const VAT_LABEL: Record<string, string> = { KLEINUNTERNEHMER: "§ 19", REGULAR: "19%", REVERSE_CHARGE: "Reverse charge", DRITTLAND: "Non-EU" };

export async function trackerRows(opts: { clientId?: string | null } = {}): Promise<TrackerRow[]> {
  const scope = opts.clientId ? { clientId: opts.clientId } : {};
  const [invoices, payments] = await Promise.all([
    prisma.studioInvoice.findMany({ where: { status: { not: "DRAFT" }, ...scope } }),
    prisma.stripePayment.findMany({ where: scope }),
  ]);
  const ids = [...new Set([...invoices.map((i) => i.clientId), ...payments.map((p) => p.clientId).filter((x): x is string => !!x)])];
  const clients = ids.length ? await prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, company: true } }) : [];
  const nameOf = new Map(clients.map((c) => [c.id, c.company || c.name]));
  const now = Date.now();
  const rows: TrackerRow[] = [];
  for (const i of invoices) {
    const d = i.paidAt || i.issueDate || i.createdAt;
    const received = !!i.paidAt && i.paidMethod !== "stripe" && i.paidMethod !== "offset";
    const open = i.status === "ISSUED" || i.status === "SENT";
    const total = Number(i.total);
    rows.push({
      id: i.id,
      source: "invoice",
      date: iso(d),
      year: d.getUTCFullYear(),
      reference: i.number || "",
      clientId: i.clientId,
      client: nameOf.get(i.clientId) || "Unknown",
      description: ((i.items as Array<{ description?: string }>) || []).map((x) => x.description).filter(Boolean).join(", "),
      currency: i.currency,
      amount: total,
      refunded: 0,
      eur: received ? (i.eurAmount != null ? Number(i.eurAmount) : i.currency === "EUR" ? total : null) : null,
      fee: null,
      status: i.status === "PAID" ? "PAID" : i.status === "VOID" ? "VOID" : i.dueDate && i.dueDate.getTime() < now ? "OVERDUE" : open ? "OPEN" : i.status,
      method: i.paidMethod || "bank",
      vat: VAT_LABEL[i.vatScheme] || i.vatScheme,
      vatAmount: Number(i.vatAmount),
      href: `/invoices?invoice=${i.id}`,
    });
  }
  for (const p of payments) {
    const amount = Number(p.amount);
    const refunded = Number(p.refunded);
    rows.push({
      id: p.id,
      source: "stripe",
      date: iso(p.paidAt),
      year: p.taxYear,
      reference: p.stripeChargeId,
      clientId: p.clientId,
      client: (p.clientId && nameOf.get(p.clientId)) || p.billingName || p.billingEmail || "Not linked to a client",
      description: p.description || "Stripe payment",
      currency: p.currency,
      amount,
      refunded,
      eur: p.eurNet != null ? Number(p.eurNet) : null,
      fee: p.fee != null ? Number(p.fee) : null,
      status: p.disputed ? "DISPUTED" : refunded >= amount ? "REFUNDED" : refunded > 0 ? "PARTLY REFUNDED" : "PAID",
      method: "stripe",
      vat: "",
      vatAmount: 0,
      href: p.receiptUrl,
    });
  }
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function costRows(): Promise<CostRow[]> {
  const [inv, payouts] = await Promise.all([
    prisma.contractorInvoice.findMany({ where: { status: "PAID" }, select: { id: true, contractorId: true, invoiceNumber: true, amount: true, currency: true, paidAt: true, invoiceDate: true, submittedAt: true } }),
    prisma.commissionPayout.findMany({ select: { id: true, partnerId: true, amount: true, currency: true, createdAt: true, wiseTransferId: true, stripeTransferId: true } }),
  ]);
  const [contractors, partners] = await Promise.all([
    prisma.contractor.findMany({ where: { id: { in: [...new Set(inv.map((i) => i.contractorId))] } }, select: { id: true, name: true, company: true } }),
    prisma.partner.findMany({ where: { id: { in: [...new Set(payouts.map((p) => p.partnerId))] } }, select: { id: true, name: true, legalName: true } }),
  ]);
  const cn = new Map(contractors.map((c) => [c.id, c.company || c.name]));
  const pn = new Map(partners.map((p) => [p.id, p.legalName || p.name]));
  const out: CostRow[] = [];
  for (const i of inv) {
    const d = i.paidAt || i.invoiceDate || i.submittedAt;
    out.push({ id: i.id, kind: "contractor", date: iso(d), year: d.getUTCFullYear(), payee: cn.get(i.contractorId) || "Contractor", reference: i.invoiceNumber || "", currency: i.currency.toUpperCase(), amount: Number(i.amount || 0) });
  }
  for (const p of payouts) out.push({ id: p.id, kind: "partner", date: iso(p.createdAt), year: p.createdAt.getUTCFullYear(), payee: pn.get(p.partnerId) || "Partner", reference: p.wiseTransferId || p.stripeTransferId || "", currency: p.currency.toUpperCase(), amount: Number(p.amount) });
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface YearSummary {
  year: number;
  incomeEur: number;
  invoiceEur: number;
  stripeEur: number;
  stripeFees: number;
  refundsCount: number;
  openCount: number;
  payments: number;
  byCurrency: Record<string, number>;
  missingEur: number; // received rows with no EUR amount: the total above is short by these
  costs: Record<string, number>;
}

export function summarizeYears(rows: TrackerRow[], costs: CostRow[]): YearSummary[] {
  const map = new Map<number, YearSummary>();
  const get = (y: number) => {
    if (!map.has(y)) map.set(y, { year: y, incomeEur: 0, invoiceEur: 0, stripeEur: 0, stripeFees: 0, refundsCount: 0, openCount: 0, payments: 0, byCurrency: {}, missingEur: 0, costs: {} });
    return map.get(y)!;
  };
  const r2 = (n: number) => Math.round(n * 100) / 100;
  for (const r of rows) {
    const y = get(r.year);
    if (r.status === "OPEN" || r.status === "OVERDUE") y.openCount++;
    const received = r.source === "stripe" || (r.status !== "OPEN" && r.status !== "OVERDUE" && (r.eur != null || r.method === "bank" || r.method === "wise"));
    const moved = r.source === "stripe" || r.eur != null;
    if (!moved) {
      if (received && r.status === "PAID") y.missingEur++;
      continue;
    }
    if (r.eur == null) {
      y.missingEur++;
    } else {
      y.incomeEur = r2(y.incomeEur + r.eur);
      if (r.source === "stripe") y.stripeEur = r2(y.stripeEur + r.eur);
      else y.invoiceEur = r2(y.invoiceEur + r.eur);
    }
    y.payments++;
    if (r.refunded > 0) y.refundsCount++;
    if (r.fee) y.stripeFees = r2(y.stripeFees + r.fee);
    y.byCurrency[r.currency] = r2((y.byCurrency[r.currency] || 0) + r.amount - r.refunded);
  }
  for (const c of costs) {
    const y = get(c.year);
    y.costs[c.currency] = r2((y.costs[c.currency] || 0) + c.amount);
  }
  return [...map.values()].sort((a, b) => b.year - a.year);
}
