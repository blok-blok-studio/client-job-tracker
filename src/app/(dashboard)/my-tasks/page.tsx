"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Calendar, CheckCircle2, Flame, Sun, CalendarRange, Inbox } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import Badge from "@/components/shared/Badge";
import TaskDetailModal from "@/components/kanban/TaskDetailModal";
import { STATUS_COLUMNS, type TaskStatus, type Priority } from "@/types";

interface MyTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  clientName: string | null;
  checklistTotal: number;
  checklistDone: number;
}

const PRIORITY_DOT: Record<Priority, string> = {
  URGENT: "bg-red-500",
  HIGH: "bg-bb-orange",
  MEDIUM: "bg-blue-500",
  LOW: "bg-bb-dim",
};

const STATUS_STYLE: Record<TaskStatus, string> = {
  BACKLOG: "bg-bb-elevated text-bb-dim",
  TODO: "bg-blue-500/15 text-blue-400",
  IN_PROGRESS: "bg-bb-orange/15 text-bb-orange",
  IN_REVIEW: "bg-purple-500/15 text-purple-400",
  DONE: "bg-emerald-500/15 text-emerald-400",
  BLOCKED: "bg-red-500/15 text-red-400",
};

type GroupKey = "overdue" | "today" | "week" | "later" | "nodate";

const GROUPS: Array<{ key: GroupKey; label: string; icon: React.ReactNode; accent: string }> = [
  { key: "overdue", label: "Overdue", icon: <Flame size={14} />, accent: "text-red-400" },
  { key: "today", label: "Due today", icon: <Sun size={14} />, accent: "text-bb-orange" },
  { key: "week", label: "This week", icon: <CalendarRange size={14} />, accent: "text-blue-400" },
  { key: "later", label: "Later", icon: <Calendar size={14} />, accent: "text-bb-muted" },
  { key: "nodate", label: "No due date", icon: <Inbox size={14} />, accent: "text-bb-dim" },
];

export default function MyTasksPage() {
  const [me, setMe] = useState<string | null>(null);
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      if (data.success) {
        setTasks(
          data.data.map((t: Record<string, unknown>) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate,
            clientName: (t.client as { name: string } | null)?.name || null,
            checklistTotal: (t._count as Record<string, number>)?.checklistItems || 0,
            checklistDone: ((t.checklistItems as Array<{ checked: boolean }>) || []).filter((i) => i.checked).length,
            assignedTo: t.assignedTo,
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.user?.name && setMe(d.user.name))
      .catch(() => {});
    fetchTasks();
  }, [fetchTasks]);

  const mine = useMemo(() => {
    if (!me) return [];
    return (tasks as Array<MyTask & { assignedTo?: string | null }>).filter(
      (t) => t.assignedTo && t.assignedTo.toLowerCase() === me.toLowerCase() && t.status !== "DONE"
    );
  }, [tasks, me]);

  const grouped = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    const weekOut = new Date(startOfToday);
    weekOut.setDate(weekOut.getDate() + 7);

    const g: Record<GroupKey, MyTask[]> = { overdue: [], today: [], week: [], later: [], nodate: [] };
    for (const t of mine) {
      if (!t.dueDate) g.nodate.push(t);
      else {
        const d = new Date(t.dueDate);
        if (d < startOfToday) g.overdue.push(t);
        else if (d < endOfToday) g.today.push(t);
        else if (d < weekOut) g.week.push(t);
        else g.later.push(t);
      }
    }
    for (const k of Object.keys(g) as GroupKey[]) {
      g[k].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
    }
    return g;
  }, [mine]);

  async function deleteTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    setDetailTaskId(null);
    fetchTasks();
  }

  return (
    <div>
      <TopBar
        title="My Tasks"
        subtitle={me ? `Everything assigned to ${me}, ordered by urgency` : "Your personal queue"}
      />
      <div className="px-4 lg:px-6 pb-8 space-y-5">
        {loading ? (
          <div className="space-y-2 pt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-14 w-full" />
            ))}
          </div>
        ) : mine.length === 0 ? (
          <div className="text-center py-20">
            <CheckCircle2 size={36} className="mx-auto text-emerald-400 mb-3" />
            <p className="text-white font-medium">All clear</p>
            <p className="text-sm text-bb-dim mt-1">Nothing assigned to you right now.</p>
          </div>
        ) : (
          GROUPS.map(({ key, label, icon, accent }) => {
            const list = grouped[key];
            if (list.length === 0) return null;
            return (
              <section key={key}>
                <h3 className={`flex items-center gap-1.5 mb-2 text-xs font-semibold uppercase tracking-wider ${accent}`}>
                  {icon}
                  {label}
                  <span className="text-bb-dim font-normal">({list.length})</span>
                </h3>
                <div className="space-y-1.5">
                  {list.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setDetailTaskId(t.id)}
                      className="w-full flex items-center gap-2.5 rounded-lg border border-bb-border bg-bb-surface px-3 py-3 text-left hover:border-bb-orange/40 hover:-translate-y-px transition-all"
                    >
                      <span className={`h-2 w-2 rounded-full shrink-0 ${PRIORITY_DOT[t.priority]}`} />
                      <span className="flex-1 min-w-0 truncate text-sm text-white">{t.title}</span>
                      {t.checklistTotal > 0 && (
                        <span className="text-[10px] text-bb-dim shrink-0">
                          {t.checklistDone}/{t.checklistTotal}
                        </span>
                      )}
                      {t.clientName && <Badge variant="default" size="sm">{t.clientName}</Badge>}
                      {t.dueDate && (
                        <span className={`hidden sm:flex items-center gap-1 text-[10px] shrink-0 ${key === "overdue" ? "text-red-400" : "text-bb-dim"}`}>
                          <Calendar size={10} />
                          {new Date(t.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      )}
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${STATUS_STYLE[t.status]}`}>
                        {STATUS_COLUMNS.find((c) => c.key === t.status)?.label || t.status}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

      <TaskDetailModal
        taskId={detailTaskId}
        onClose={() => setDetailTaskId(null)}
        onChanged={fetchTasks}
        onDelete={deleteTask}
      />
    </div>
  );
}
