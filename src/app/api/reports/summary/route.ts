import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Aggregates for the Reports page: workload, hours, lead funnel.
// No income figures anywhere — Stripe is the books (removed 2026-08-16).
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
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.client.count({ where: { type: "ACTIVE" } }),
  ]);

  // Lead-source funnel: leads → active (won), per client.source
  const [allClients, newsletterCount] = await Promise.all([
    prisma.client.findMany({
      where: { type: { not: "ARCHIVED" } },
      select: { id: true, source: true, type: true },
    }),
    prisma.newsletterSubscriber.count({ where: { unsubscribedAt: null } }),
  ]);
  const bySource = new Map<string, { leads: number; won: number }>();
  for (const c of allClients) {
    const key = c.source?.trim() || "Unknown";
    const row = bySource.get(key) || { leads: 0, won: 0 };
    row.leads++;
    if (c.type === "ACTIVE" || c.type === "PAST") row.won++;
    bySource.set(key, row);
  }
  const leadSources = Array.from(bySource, ([source, r]) => ({
    source,
    leads: r.leads,
    won: r.won,
    winRate: r.leads > 0 ? Math.round((r.won / r.leads) * 100) : 0,
  })).sort((a, b) => b.won - a.won || b.leads - a.leads);

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
      openTickets: openTicketCount,
      activeClients: activeClientCount,
      leadSources,
      newsletterCount,
    },
  });
}
