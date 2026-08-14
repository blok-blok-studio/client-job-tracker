"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Flame, Sun, CalendarRange, ArrowRight, CheckCircle2 } from "lucide-react";
import Badge from "@/components/shared/Badge";
import { teamRoleLabel } from "@/lib/team-roles";

export interface MyWorkTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  clientName: string | null;
  assignedTo: string | null;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Morning";
  if (h < 18) return "Afternoon";
  return "Evening";
}

/**
 * The top of the Command Center: what *this* person owes, before the
 * studio-wide numbers. Reads the same task list the rest of the dashboard
 * already loads — no extra round trip.
 */
export default function MyWork({
  me,
  tasks,
  loading,
}: {
  me: { name: string; jobRole?: string | null } | null;
  tasks: MyWorkTask[];
  loading?: boolean;
}) {
  const { overdue, today, week, next } = useMemo(() => {
    const name = me?.name?.toLowerCase();
    const mine = name
      ? tasks.filter((t) => t.assignedTo?.toLowerCase() === name && t.status !== "DONE")
      : [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    const weekOut = new Date(startOfToday);
    weekOut.setDate(weekOut.getDate() + 7);

    const overdue: MyWorkTask[] = [];
    const today: MyWorkTask[] = [];
    const week: MyWorkTask[] = [];
    for (const t of mine) {
      if (!t.dueDate) continue;
      const d = new Date(t.dueDate);
      if (d < startOfToday) overdue.push(t);
      else if (d < endOfToday) today.push(t);
      else if (d < weekOut) week.push(t);
    }

    // Soonest first, undated last — the order you'd actually work in
    const next = [...mine]
      .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))
      .slice(0, 5);

    return { mine, overdue, today, week, next };
  }, [tasks, me]);

  const role = teamRoleLabel(me?.jobRole);

  const tiles = [
    { label: "Overdue", value: overdue.length, icon: Flame, accent: "text-red-400" },
    { label: "Due today", value: today.length, icon: Sun, accent: "text-bb-orange" },
    { label: "This week", value: week.length, icon: CalendarRange, accent: "text-blue-400" },
  ];

  return (
    <div className="bg-bb-surface border border-bb-border rounded-lg p-4 lg:p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white truncate">
            {greeting()}
            {me?.name ? `, ${me.name.split(" ")[0]}` : ""}
          </h2>
          <p className="text-xs text-bb-dim">
            {role ? `${role} · your work first` : "Your work first"}
          </p>
        </div>
        <Link
          href="/my-tasks"
          className="flex items-center gap-1 text-xs text-bb-muted hover:text-bb-orange transition-colors shrink-0"
        >
          All my tasks <ArrowRight size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2 lg:gap-3 mb-4">
        {tiles.map((t) => (
          <div key={t.label} className="bg-bb-black border border-bb-border rounded-lg p-3">
            <div className="flex items-center gap-1.5">
              <t.icon size={13} className={t.accent} />
              <span className="text-lg font-semibold text-white">{t.value}</span>
            </div>
            <p className="text-[11px] text-bb-dim mt-0.5">{t.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-xs text-bb-dim py-2">Loading your work…</p>
      ) : next.length === 0 ? (
        <div className="flex items-center gap-2 py-3 text-sm text-bb-dim">
          <CheckCircle2 size={15} className="text-green-400/70" />
          Nothing assigned to you right now.
        </div>
      ) : (
        <div className="space-y-1.5">
          {next.map((t) => {
            const overdueTask = t.dueDate && new Date(t.dueDate) < new Date();
            return (
              <Link
                key={t.id}
                href={`/kanban?task=${t.id}`}
                className="flex items-center gap-3 p-2.5 rounded-md bg-bb-black border border-bb-border hover:border-bb-orange/50 transition-colors"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-white truncate">{t.title}</span>
                  <span className="block text-[11px] text-bb-dim truncate">
                    {t.clientName || "Internal"}
                    {t.dueDate
                      ? ` · due ${new Date(t.dueDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}`
                      : " · no due date"}
                  </span>
                </span>
                {overdueTask && <Badge variant="red">LATE</Badge>}
                {t.priority === "HIGH" && !overdueTask && <Badge variant="orange">HIGH</Badge>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
