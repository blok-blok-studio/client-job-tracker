"use client";

import { useState, useEffect } from "react";
import {
  ClipboardList, Flame, CheckCircle2, Clock, Users, LifeBuoy, Receipt,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { STATUS_COLUMNS } from "@/types";

interface Summary {
  tasks: {
    byStatus: Array<{ status: string; count: number }>;
    byAssignee: Array<{ assignee: string; count: number }>;
    overdue: number;
    completed30d: number;
  };
  time: {
    byClient: Array<{ client: string; minutes: number }>;
    byUser: Array<{ user: string; minutes: number }>;
    thisMonthMinutes: number;
  };
  invoices: Array<{ status: string; count: number; total: number }>;
  openTickets: number;
  activeClients: number;
}

function fmtHours(mins: number): string {
  const h = mins / 60;
  return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

const STATUS_BAR: Record<string, string> = {
  BACKLOG: "bg-bb-dim",
  TODO: "bg-blue-500",
  IN_PROGRESS: "bg-bb-orange",
  IN_REVIEW: "bg-purple-500",
  DONE: "bg-emerald-500",
  BLOCKED: "bg-red-500",
};

function StatTile({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
      <div className="flex items-center gap-1.5 text-bb-dim mb-2">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-display font-bold ${accent || "text-white"}`}>{value}</p>
    </div>
  );
}

function BarList({ rows, unit }: { rows: Array<{ label: string; value: number; display: string; color?: string }>; unit: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2.5">
      {rows.length === 0 && <p className="text-xs text-bb-dim py-2">No {unit} yet.</p>}
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-white truncate pr-2">{r.label}</span>
            <span className="text-xs text-bb-muted shrink-0">{r.display}</span>
          </div>
          <div className="h-1.5 rounded-full bg-bb-elevated overflow-hidden">
            <div
              className={`h-full rounded-full ${r.color || "bg-bb-orange"}`}
              style={{ width: `${Math.max(4, (r.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    fetch("/api/reports/summary")
      .then((r) => r.json())
      .then((d) => d.success && setData(d.data))
      .catch(() => {});
  }, []);

  const openTasks = data
    ? data.tasks.byStatus.filter((s) => s.status !== "DONE").reduce((a, s) => a + s.count, 0)
    : 0;

  return (
    <div>
      <TopBar title="Reports" subtitle="Workload, hours, and revenue at a glance" />
      <div className="px-4 lg:px-6 pb-8 space-y-6">
        {!data ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton h-24 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* KPI tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile icon={<ClipboardList size={13} />} label="Open tasks" value={openTasks} />
              <StatTile icon={<Flame size={13} />} label="Overdue" value={data.tasks.overdue} accent={data.tasks.overdue > 0 ? "text-red-400" : "text-emerald-400"} />
              <StatTile icon={<CheckCircle2 size={13} />} label="Done · 30 days" value={data.tasks.completed30d} accent="text-emerald-400" />
              <StatTile icon={<Clock size={13} />} label="Hours this month" value={fmtHours(data.time.thisMonthMinutes)} accent="text-bb-orange" />
              <StatTile icon={<Users size={13} />} label="Active clients" value={data.activeClients} />
              <StatTile icon={<LifeBuoy size={13} />} label="Open tickets" value={data.openTickets} />
              {(() => {
                const paid = data.invoices.find((i) => i.status === "PAID");
                const outstanding = data.invoices
                  .filter((i) => i.status === "SENT" || i.status === "OVERDUE")
                  .reduce((a, i) => a + i.total, 0);
                return (
                  <>
                    <StatTile icon={<Receipt size={13} />} label="Invoiced · paid" value={fmtMoney(paid?.total || 0)} accent="text-emerald-400" />
                    <StatTile icon={<Receipt size={13} />} label="Outstanding" value={fmtMoney(outstanding)} accent={outstanding > 0 ? "text-amber-400" : "text-white"} />
                  </>
                );
              })()}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Pipeline by status */}
              <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
                <h3 className="text-sm font-display font-semibold text-white mb-3">Task pipeline</h3>
                <BarList
                  unit="tasks"
                  rows={STATUS_COLUMNS.map((c) => {
                    const count = data.tasks.byStatus.find((s) => s.status === c.key)?.count || 0;
                    return { label: c.label, value: count, display: String(count), color: STATUS_BAR[c.key] };
                  }).filter((r) => r.value > 0)}
                />
              </div>

              {/* Workload per member */}
              <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
                <h3 className="text-sm font-display font-semibold text-white mb-3">Open tasks per member</h3>
                <BarList
                  unit="assignments"
                  rows={data.tasks.byAssignee.map((a) => ({
                    label: a.assignee,
                    value: a.count,
                    display: String(a.count),
                  }))}
                />
              </div>

              {/* Hours by client */}
              <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
                <h3 className="text-sm font-display font-semibold text-white mb-3">Hours by client</h3>
                <BarList
                  unit="hours logged"
                  rows={data.time.byClient.slice(0, 8).map((t) => ({
                    label: t.client,
                    value: t.minutes,
                    display: fmtHours(t.minutes),
                  }))}
                />
              </div>

              {/* Hours by member */}
              <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
                <h3 className="text-sm font-display font-semibold text-white mb-3">Hours by member</h3>
                <BarList
                  unit="hours logged"
                  rows={data.time.byUser.map((t) => ({
                    label: t.user,
                    value: t.minutes,
                    display: fmtHours(t.minutes),
                  }))}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
