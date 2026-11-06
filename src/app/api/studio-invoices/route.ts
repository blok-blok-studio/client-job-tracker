import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requireOwner, handleError } from "./_shared";
import { createDraft, draftSchema } from "@/lib/invoicing/service";
import { loadInvoiceSettings, missingBankFields, settingsWarnings } from "@/lib/invoicing/settings";
import { yearRevenueEur, incomeByMonth } from "@/lib/invoicing/revenue";

export const dynamic = "force-dynamic";

const LIST_SELECT = {
  id: true,
  token: true,
  number: true,
  kind: true,
  correctsId: true,
  quoteId: true,
  milestone: true,
  status: true,
  template: true,
  language: true,
  currency: true,
  vatScheme: true,
  total: true,
  issueDate: true,
  dueDate: true,
  sentAt: true,
  paidAt: true,
  paidMethod: true,
  paymentReportedAt: true,
  eurAmount: true,
  voidedAt: true,
  paymentMethod: true,
  createdAt: true,
  readyAt: true,
  contractId: true,
  clientId: true,
  client: { select: { id: true, name: true, company: true } },
  partner: { select: { id: true, name: true } },
} as const;

/**
 * Drafts have no issue date, so the newest-first sort listed a split as
 * Completion, Milestone, Milestone, Deposit. Keep drafts of the same contract
 * (or quote, or client) together in payment order: Deposit first.
 */
function orderMilestoneDrafts<T extends { status: string; issueDate: Date | null; createdAt: Date; contractId: string | null; quoteId: string | null; clientId: string | null; id: string }>(rows: T[]): T[] {
  const isDraft = (r: T) => r.status === "DRAFT" && !r.issueDate;
  const drafts = rows.filter(isDraft);
  const rest = rows.filter((r) => !isDraft(r));
  const key = (r: T) => r.contractId ?? r.quoteId ?? (r.clientId ? `client:${r.clientId}` : r.id);
  const newest = new Map<string, number>();
  for (const r of drafts) newest.set(key(r), Math.max(newest.get(key(r)) ?? 0, r.createdAt.getTime()));
  drafts.sort((a, b) => {
    const ka = key(a), kb = key(b);
    if (ka !== kb) return newest.get(kb)! - newest.get(ka)! || (ka < kb ? -1 : 1);
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return [...drafts, ...rest];
}

// GET — every studio invoice + the tiles (outstanding / overdue / paid this month) + the § 19 watch
export async function GET(request: NextRequest) {
  const { denied } = await requireOwner();
  if (denied) return denied;
  try {
    const sp = new URL(request.url).searchParams;
    const status = sp.get("status");
    const year = sp.get("year");
    const clientId = sp.get("clientId");
    const where: Prisma.StudioInvoiceWhereInput = {};
    if (status && status !== "all") where.status = status as Prisma.StudioInvoiceWhereInput["status"];
    if (clientId) where.clientId = clientId;
    if (year && /^\d{4}$/.test(year)) {
      const y = Number(year);
      where.OR = [
        { issueDate: { gte: new Date(Date.UTC(y, 0, 1)), lt: new Date(Date.UTC(y + 1, 0, 1)) } },
        { issueDate: null, createdAt: { gte: new Date(Date.UTC(y, 0, 1)), lt: new Date(Date.UTC(y + 1, 0, 1)) } },
      ];
    }
    const rows = await prisma.studioInvoice.findMany({ where, select: LIST_SELECT, orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }] });
    const data = orderMilestoneDrafts(rows).map((r) => ({ ...r, total: Number(r.total), eurAmount: r.eurAmount != null ? Number(r.eurAmount) : null }));

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const all = await prisma.studioInvoice.findMany({
      where: { status: { in: ["ISSUED", "SENT", "PAID"] }, kind: "INVOICE" },
      select: { status: true, currency: true, total: true, dueDate: true, paidAt: true },
    });
    const sum = (list: typeof all) =>
      list.reduce<Record<string, number>>((acc, i) => {
        acc[i.currency] = Math.round(((acc[i.currency] || 0) + Number(i.total)) * 100) / 100;
        return acc;
      }, {});
    const open = all.filter((i) => i.status !== "PAID");
    const overdue = open.filter((i) => i.dueDate && i.dueDate < now);
    const paidThisMonth = all.filter((i) => i.status === "PAID" && i.paidAt && i.paidAt >= monthStart);

    const settings = await loadInvoiceSettings();
    const revenue = await yearRevenueEur(now.getUTCFullYear()).catch(() => null);
    const income = await incomeByMonth(now.getUTCFullYear()).catch(() => null);

    return NextResponse.json({
      success: true,
      data,
      summary: {
        outstanding: { count: open.length, byCurrency: sum(open) },
        overdue: { count: overdue.length, byCurrency: sum(overdue) },
        paidThisMonth: { count: paidThisMonth.length, byCurrency: sum(paidThisMonth) },
        revenue,
        income,
        reported: all.length ? await prisma.studioInvoice.count({ where: { status: { in: ["ISSUED", "SENT"] }, paymentReportedAt: { not: null } } }) : 0,
        setup: {
          missingBank: { EUR: missingBankFields(settings, "EUR"), USD: missingBankFields(settings, "USD") },
          warnings: settingsWarnings(settings),
        },
      },
    });
  } catch (err) {
    return handleError(err, "Failed to load invoices");
  }
}

// POST — new draft (no number yet)
export async function POST(request: NextRequest) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const body = draftSchema.parse(await request.json());
    const { invoice, warning } = await createDraft(body, session.name);
    return NextResponse.json({ success: true, data: { ...invoice, total: Number(invoice.total), subtotal: Number(invoice.subtotal), vatAmount: Number(invoice.vatAmount), vatRate: Number(invoice.vatRate) }, warning }, { status: 201 });
  } catch (err) {
    return handleError(err, "Failed to create invoice");
  }
}
