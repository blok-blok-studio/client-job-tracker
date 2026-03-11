import prisma from "@/lib/prisma";
import type { Priority } from "@/types";
import TopBar from "@/components/layout/TopBar";
import StatsGrid from "@/components/dashboard/StatsGrid";
import UpcomingDeadlines from "@/components/dashboard/UpcomingDeadlines";
import AgentActivityFeed from "@/components/dashboard/AgentActivityFeed";
import RevenueChart from "@/components/dashboard/RevenueChart";

async function getDashboardData() {
  const [activeClients, openTasks, overdueItems, upcomingTasks, agentActivity, clients] =
    await Promise.all([
      prisma.client.count({ where: { type: "ACTIVE" } }),
      prisma.task.count({
        where: { status: { notIn: ["DONE", "BLOCKED"] } },
      }),
      prisma.task.count({
        where: {
          dueDate: { lt: new Date() },
          status: { notIn: ["DONE"] },
        },
      }),
      prisma.task.findMany({
        where: {
          dueDate: { not: null },
          status: { notIn: ["DONE"] },
        },
        orderBy: { dueDate: "asc" },
        take: 10,
        include: { client: { select: { name: true } } },
      }),
      prisma.activityLog.findMany({
        where: { actor: "agent" },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { client: { select: { name: true } } },
      }),
      prisma.client.findMany({
        where: { type: "ACTIVE", monthlyRetainer: { not: null } },
        select: { monthlyRetainer: true },
      }),
    ]);

  const monthlyRevenue = clients.reduce(
    (sum, c) => sum + (c.monthlyRetainer ? Number(c.monthlyRetainer) : 0),
    0
  );

  // Generate 12-month revenue chart (simplified: uses current retainer * months back)
  const now = new Date();
  const revenueData = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return {
      month: date.toLocaleString("default", { month: "short" }),
      revenue: monthlyRevenue * (0.7 + Math.random() * 0.3), // slight variation for demo
    };
  });

  return {
    activeClients,
    openTasks,
    monthlyRevenue,
    overdueItems,
    deadlines: upcomingTasks.map((t: Record<string, unknown>) => ({
      id: t.id as string,
      title: t.title as string,
      dueDate: (t.dueDate as Date).toISOString(),
      priority: t.priority as Priority,
      clientName: (t as { client?: { name: string } }).client?.name || null,
      status: t.status as string,
    })),
    activities: agentActivity.map((a: Record<string, unknown>) => ({
      id: a.id as string,
      action: a.action as string,
      details: a.details as string | null,
      clientName: (a as { client?: { name: string } }).client?.name || null,
      createdAt: (a.createdAt as Date).toISOString(),
    })),
    revenueData,
  };
}

export default async function DashboardPage() {
  let data;
  try {
    data = await getDashboardData();
  } catch {
    // DB not connected — show empty state
    data = {
      activeClients: 0,
      openTasks: 0,
      monthlyRevenue: 0,
      overdueItems: 0,
      deadlines: [],
      activities: [],
      revenueData: [],
    };
  }

  return (
    <div>
      <TopBar title="Command Center" subtitle="Overview of all operations" />
      <div className="px-6 space-y-6 pb-8">
        <StatsGrid
          activeClients={data.activeClients}
          openTasks={data.openTasks}
          monthlyRevenue={data.monthlyRevenue}
          overdueItems={data.overdueItems}
        />

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <UpcomingDeadlines deadlines={data.deadlines} />
          </div>
          <div className="lg:col-span-2">
            <AgentActivityFeed activities={data.activities} />
          </div>
        </div>

        <RevenueChart data={data.revenueData} />
      </div>
    </div>
  );
}
