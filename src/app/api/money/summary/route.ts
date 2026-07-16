import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

// Financial overview: collected, outstanding, pipeline, MRR, per-client revenue.
export async function GET() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Accelerate-extended client loses aggregate/relation inference inside
  // Promise.all — cast to the known payload shapes.
  type Agg = { _sum: { amount: unknown }; _count: { _all: number } };
  const [paidAll, paidMonth, outstanding, drafts, activeClients, prospectClients, paidByClient, recentPaid] =
    await Promise.all([
      prisma.invoice.aggregate({ where: { status: "PAID" }, _sum: { amount: true }, _count: { _all: true } }) as unknown as Promise<Agg>,
      prisma.invoice.aggregate({
        where: { status: "PAID", paidAt: { gte: monthStart } },
        _sum: { amount: true },
      }) as unknown as Promise<{ _sum: { amount: unknown } }>,
      prisma.invoice.aggregate({
        where: { status: { in: ["SENT", "OVERDUE"] } },
        _sum: { amount: true },
        _count: { _all: true },
      }) as unknown as Promise<Agg>,
      prisma.invoice.aggregate({ where: { status: "DRAFT" }, _sum: { amount: true }, _count: { _all: true } }) as unknown as Promise<Agg>,
      prisma.client.findMany({
        where: { type: "ACTIVE" },
        select: { monthlyRetainer: true },
      }),
      prisma.client.findMany({
        where: { type: "PROSPECT" },
        select: { monthlyRetainer: true },
      }),
      prisma.invoice.groupBy({ by: ["clientId"], where: { status: "PAID" }, _sum: { amount: true } }) as unknown as Promise<
        Array<{ clientId: string; _sum: { amount: unknown } }>
      >,
      prisma.invoice.findMany({
        where: { status: "PAID" },
        select: { id: true, amount: true, paidAt: true, notes: true, client: { select: { name: true } } },
        orderBy: { paidAt: "desc" },
        take: 8,
      }) as unknown as Promise<
        Array<{ id: string; amount: unknown; paidAt: Date | null; notes: string | null; client: { name: string } | null }>
      >,
    ]);

  const clientIds = paidByClient.map((p) => p.clientId);
  const names = clientIds.length
    ? await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(names.map((c) => [c.id, c.name]));

  // Live Stripe balance — best-effort, page still renders if Stripe is down
  let stripeBalance: { available: number; pending: number; currency: string } | null = null;
  try {
    const bal = await getStripe().balance.retrieve();
    const sum = (arr: Array<{ amount: number; currency: string }>) =>
      arr.reduce((a, b) => a + b.amount, 0) / 100;
    stripeBalance = {
      available: sum(bal.available),
      pending: sum(bal.pending),
      currency: (bal.available[0]?.currency || "usd").toUpperCase(),
    };
  } catch { /* no key locally / API hiccup */ }

  const mrr = activeClients.reduce((a, c) => a + Number(c.monthlyRetainer || 0), 0);
  const pipelineRetainers = prospectClients.reduce((a, c) => a + Number(c.monthlyRetainer || 0), 0);

  return NextResponse.json({
    success: true,
    data: {
      stripeBalance,
      collected: Number(paidAll._sum.amount || 0),
      collectedCount: paidAll._count._all,
      collectedThisMonth: Number(paidMonth._sum.amount || 0),
      outstanding: Number(outstanding._sum.amount || 0),
      outstandingCount: outstanding._count._all,
      drafts: Number(drafts._sum.amount || 0),
      draftCount: drafts._count._all,
      mrr,
      pipeline: pipelineRetainers + Number(drafts._sum.amount || 0),
      avgTicket: paidAll._count._all > 0 ? Number(paidAll._sum.amount || 0) / paidAll._count._all : 0,
      revenueByClient: paidByClient
        .map((p) => ({ client: nameById.get(p.clientId) || "Unknown", total: Number(p._sum.amount || 0) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
      recentPaid: recentPaid.map((i) => ({
        id: i.id,
        client: i.client?.name || "Unknown",
        amount: Number(i.amount || 0),
        paidAt: i.paidAt,
        notes: i.notes,
      })),
    },
  });
}
