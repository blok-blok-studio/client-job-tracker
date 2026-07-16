import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Aggregates for the Reports page: workload, hours, revenue pipeline.
export async function GET() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    byStatus,
    byAssignee,
    overdue,
    completed30d,
    timeByClient,
    timeByUser,
    timeThisMonth,
    invoicesByStatus,
    openTicketCount,
    activeClientCount,
  ] = await Promise.all([
    // The Accelerate-extended client loses groupBy result inference inside
    // Promise.all — cast to the known payload shapes (same workaround used
    // elsewhere in this codebase).
    prisma.task.groupBy({ by: ["status"], _count: { _all: true } }) as unknown as Promise<
      Array<{ status: string; _count: { _all: number } }>
    >,
    prisma.task.groupBy({
      by: ["assignedTo"],
      where: { status: { notIn: ["DONE"] } },
      _count: { _all: true },
    }) as unknown as Promise<Array<{ assignedTo: string | null; _count: { _all: number } }>>,
    prisma.task.count({ where: { dueDate: { lt: now }, status: { notIn: ["DONE"] } } }),
    prisma.task.count({ where: { status: "DONE", completedAt: { gte: thirtyDaysAgo } } }),
    prisma.timeEntry.groupBy({ by: ["clientId"], _sum: { minutes: true } }) as unknown as Promise<
      Array<{ clientId: string | null; _sum: { minutes: number | null } }>
    >,
    prisma.timeEntry.groupBy({ by: ["userName"], _sum: { minutes: true } }) as unknown as Promise<
      Array<{ userName: string; _sum: { minutes: number | null } }>
    >,
    prisma.timeEntry.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { minutes: true } }),
    prisma.invoice.groupBy({ by: ["status"], _count: { _all: true }, _sum: { amount: true } }) as unknown as Promise<
      Array<{ status: string; _count: { _all: number }; _sum: { amount: unknown } }>
    >,
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.client.count({ where: { type: "ACTIVE" } }),
  ]);

  // Lead-source funnel: leads → active (won) → revenue, per client.source
  const [allClients, paidInvoices, newsletterCount] = await Promise.all([
    prisma.client.findMany({
      where: { type: { not: "ARCHIVED" } },
      select: { id: true, source: true, type: true },
    }),
    prisma.invoice.findMany({ where: { status: "PAID" }, select: { clientId: true, amount: true } }),
    prisma.newsletterSubscriber.count({ where: { unsubscribedAt: null } }),
  ]);
  const revenueByClientId = new Map<string, number>();
  for (const inv of paidInvoices) {
    revenueByClientId.set(inv.clientId, (revenueByClientId.get(inv.clientId) || 0) + Number(inv.amount));
  }
  const bySource = new Map<string, { leads: number; won: number; revenue: number }>();
  for (const c of allClients) {
    const key = c.source?.trim() || "Unknown";
    const row = bySource.get(key) || { leads: 0, won: 0, revenue: 0 };
    row.leads++;
    if (c.type === "ACTIVE" || c.type === "PAST") row.won++;
    row.revenue += revenueByClientId.get(c.id) || 0;
    bySource.set(key, row);
  }
  const leadSources = Array.from(bySource, ([source, r]) => ({
    source,
    leads: r.leads,
    won: r.won,
    winRate: r.leads > 0 ? Math.round((r.won / r.leads) * 100) : 0,
    revenue: r.revenue,
  })).sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);

  // Resolve client names for the hours table
  const clientIds = timeByClient.map((t) => t.clientId).filter((id): id is string => !!id);
  const clients = clientIds.length
    ? await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(clients.map((c) => [c.id, c.name]));

  return NextResponse.json({
    success: true,
    data: {
      tasks: {
        byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
        byAssignee: byAssignee.map((a) => ({ assignee: a.assignedTo || "Unassigned", count: a._count._all })),
        overdue,
        completed30d,
      },
      time: {
        byClient: timeByClient
          .map((t) => ({
            client: t.clientId ? nameById.get(t.clientId) || "Unknown" : "No client",
            minutes: t._sum.minutes || 0,
          }))
          .sort((a, b) => b.minutes - a.minutes),
        byUser: timeByUser
          .map((t) => ({ user: t.userName, minutes: t._sum.minutes || 0 }))
          .sort((a, b) => b.minutes - a.minutes),
        thisMonthMinutes: timeThisMonth._sum.minutes || 0,
      },
      invoices: invoicesByStatus.map((i) => ({
        status: i.status,
        count: i._count._all,
        total: Number(i._sum.amount || 0),
      })),
      openTickets: openTicketCount,
      activeClients: activeClientCount,
      leadSources,
      newsletterCount,
    },
  });
}
