"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Users, ArrowRight } from "lucide-react";
import { teamRoleLabel } from "@/lib/team-roles";
import type { MyWorkTask } from "@/components/dashboard/MyWork";

export interface WorkloadMember {
  id: string;
  name: string;
  color?: string | null;
  jobRole?: string | null;
  isActive?: boolean;
}

/**
 * Who's carrying what. Owner-only, and deliberately just counts — the point is
 * spotting someone buried or someone idle at a glance, not a report.
 */
export default function TeamWorkload({
  team,
  tasks,
}: {
  team: WorkloadMember[];
  tasks: MyWorkTask[];
}) {
  const rows = useMemo(() => {
    const open = tasks.filter((t) => t.status !== "DONE");
    const now = new Date();

    const counts = new Map<string, { open: number; overdue: number }>();
    let unassigned = 0;
    for (const t of open) {
      if (!t.assignedTo || t.assignedTo.toLowerCase() === "agent") {
        unassigned++;
        continue;
      }
      const key = t.assignedTo.toLowerCase();
      const entry = counts.get(key) || { open: 0, overdue: 0 };
      entry.open++;
      if (t.dueDate && new Date(t.dueDate) < now) entry.overdue++;
      counts.set(key, entry);
    }

    const members = team
      .filter((m) => m.isActive !== false)
      .map((m) => ({
        ...m,
        ...(counts.get(m.name.toLowerCase()) || { open: 0, overdue: 0 }),
      }));

    // Anyone holding tasks who isn't a current team account (old typed names)
    const known = new Set(team.map((m) => m.name.toLowerCase()));
    const strays = [...counts.entries()]
      .filter(([name]) => !known.has(name))
      .map(([name, c]) => ({ id: `stray-${name}`, name, color: null, jobRole: null, ...c }));

    const all = [...members, ...strays].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
    const max = Math.max(1, ...all.map((m) => m.open));
    return { all, max, unassigned };
  }, [team, tasks]);

  return (
    <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Users size={15} className="text-bb-orange" />
          Who&apos;s carrying what
        </h2>
        <Link
          href="/kanban"
          className="flex items-center gap-1 text-xs text-bb-muted hover:text-bb-orange transition-colors"
        >
          Board <ArrowRight size={12} />
        </Link>
      </div>

      <div className="space-y-2">
        {rows.all.length === 0 ? (
          <p className="text-xs text-bb-dim">No team members yet.</p>
        ) : (
          rows.all.map((m) => (
            <div key={m.id} className="flex items-center gap-3">
              <span
                className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-semibold text-black/70"
                style={{ backgroundColor: m.color || "#2A2A2A" }}
                title={teamRoleLabel(m.jobRole) || m.name}
              >
                <span className={m.color ? "" : "text-bb-muted"}>
                  {m.name.charAt(0).toUpperCase()}
                </span>
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-white truncate">
                    {m.name}
                    {teamRoleLabel(m.jobRole) && (
                      <span className="text-bb-dim"> · {teamRoleLabel(m.jobRole)}</span>
                    )}
                  </span>
                  <span className="text-[11px] text-bb-dim shrink-0">
                    {m.open} open
                    {m.overdue > 0 && <span className="text-red-400"> · {m.overdue} late</span>}
                  </span>
                </div>
                <div className="h-1.5 bg-bb-black rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(m.open / rows.max) * 100}%`,
                      backgroundColor: m.overdue > 0 ? "#ef4444" : m.color || "#FF6B00",
                    }}
                  />
                </div>
              </div>
            </div>
          ))
        )}

        {rows.unassigned > 0 && (
          <Link
            href="/kanban"
            className="block pt-2 mt-1 border-t border-bb-border/50 text-[11px] text-bb-dim hover:text-bb-orange transition-colors"
          >
            {rows.unassigned} open task{rows.unassigned === 1 ? "" : "s"} with nobody on them →
          </Link>
        )}
      </div>
    </div>
  );
}
