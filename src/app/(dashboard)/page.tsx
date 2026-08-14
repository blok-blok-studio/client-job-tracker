"use client";

import { useState, useEffect, useCallback } from "react";
import type { Priority } from "@/types";
import TopBar from "@/components/layout/TopBar";
import StatsGrid from "@/components/dashboard/StatsGrid";
import UpcomingDeadlines from "@/components/dashboard/UpcomingDeadlines";
import AgentActivityFeed from "@/components/dashboard/AgentActivityFeed";
import MyWork, { type MyWorkTask } from "@/components/dashboard/MyWork";
import TeamWorkload, { type WorkloadMember } from "@/components/dashboard/TeamWorkload";
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

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    activeClients: 0,
    openTasks: 0,
    overdueItems: 0,
  });
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [me, setMe] = useState<{ name: string; role: string; jobRole?: string | null } | null>(null);
  const [tasks, setTasks] = useState<MyWorkTask[]>([]);
  const [team, setTeam] = useState<WorkloadMember[]>([]);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [statsRes, deadlinesRes, activityRes, tasksRes] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch("/api/dashboard/deadlines"),
        fetch("/api/dashboard/activity"),
        fetch("/api/tasks"),
      ]);

      const [statsData, deadlinesData, activityData, tasksData] = await Promise.all([
        statsRes.json(),
        deadlinesRes.json(),
        activityRes.ok ? activityRes.json() : { success: false },
        tasksRes.ok ? tasksRes.json() : { success: false },
      ]);

      if (statsData.success) setStats(statsData.data);
      if (deadlinesData.success) setDeadlines(deadlinesData.data);
      if (activityData.success) setActivities(activityData.data);
      if (tasksData.success) {
        setTasks(
          (tasksData.data as Array<Record<string, unknown>>).map((t) => ({
            id: t.id as string,
            title: t.title as string,
            status: t.status as string,
            priority: t.priority as string,
            dueDate: (t.dueDate as string) || null,
            clientName: (t.client as { name: string } | null)?.name || null,
            assignedTo: (t.assignedTo as string) || null,
          }))
        );
      }
    } catch {
      // API not available — keep empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.user && setMe(d.user))
      .catch(() => {});
  }, [fetchDashboardData]);

  // The workload panel is the owner's view of the studio, so it only loads for them
  useEffect(() => {
    if (me?.role !== "OWNER") return;
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => Array.isArray(d?.users) && setTeam(d.users))
      .catch(() => {});
  }, [me?.role]);

  return (
    <div>
      <TopBar title="Command Center" subtitle="Your work, then the studio" />
      <div className="px-4 lg:px-6 space-y-4 lg:space-y-6 pb-8">
        <MyWork me={me} tasks={tasks} loading={loading} />

        {loading ? (
          <DashboardSkeleton />
        ) : (
          <>
            <StatsGrid
              activeClients={stats.activeClients}
              openTasks={stats.openTasks}
              overdueItems={stats.overdueItems}
            />

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3">
                <UpcomingDeadlines deadlines={deadlines} onRefresh={fetchDashboardData} />
              </div>
              <div className="lg:col-span-2 space-y-4 lg:space-y-6">
                {me?.role === "OWNER" && <TeamWorkload team={team} tasks={tasks} />}
                <AgentActivityFeed activities={activities} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
