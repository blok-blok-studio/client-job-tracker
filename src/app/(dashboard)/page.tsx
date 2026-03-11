"use client";

import { useState, useEffect, useCallback } from "react";
import type { Priority } from "@/types";
import TopBar from "@/components/layout/TopBar";
import StatsGrid from "@/components/dashboard/StatsGrid";
import UpcomingDeadlines from "@/components/dashboard/UpcomingDeadlines";
import AgentActivityFeed from "@/components/dashboard/AgentActivityFeed";
import RevenueChart from "@/components/dashboard/RevenueChart";
import { DashboardSkeleton } from "@/components/shared/Skeleton";

interface Deadline {
  id: string;
  title: string;
  dueDate: string;
  priority: Priority;
  clientName: string | null;
  status: string;
}

interface Activity {
  id: string;
  action: string;
  details: string | null;
  clientName: string | null;
  createdAt: string;
}

interface RevenueDataPoint {
  month: string;
  revenue: number;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    activeClients: 0,
    openTasks: 0,
    monthlyRevenue: 0,
    overdueItems: 0,
  });
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueDataPoint[]>([]);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [statsRes, deadlinesRes, revenueRes, activityRes] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch("/api/dashboard/deadlines"),
        fetch("/api/dashboard/revenue"),
        fetch("/api/dashboard/activity"),
      ]);

      const [statsData, deadlinesData, revenueDataRes, activityData] = await Promise.all([
        statsRes.json(),
        deadlinesRes.json(),
        revenueRes.json(),
        activityRes.ok ? activityRes.json() : { success: false },
      ]);

      if (statsData.success) setStats(statsData.data);
      if (deadlinesData.success) setDeadlines(deadlinesData.data);
      if (revenueDataRes.success) setRevenueData(revenueDataRes.data);
      if (activityData.success) setActivities(activityData.data);
    } catch {
      // API not available — keep empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return (
    <div>
      <TopBar title="Command Center" subtitle="Overview of all operations" />
      <div className="px-4 lg:px-6 space-y-4 lg:space-y-6 pb-8">
        {loading ? <DashboardSkeleton /> : <>
        <StatsGrid
          activeClients={stats.activeClients}
          openTasks={stats.openTasks}
          monthlyRevenue={stats.monthlyRevenue}
          overdueItems={stats.overdueItems}
        />

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <UpcomingDeadlines deadlines={deadlines} onRefresh={fetchDashboardData} />
          </div>
          <div className="lg:col-span-2">
            <AgentActivityFeed activities={activities} />
          </div>
        </div>

        <RevenueChart data={revenueData} />
        </>}
      </div>
    </div>
  );
}
