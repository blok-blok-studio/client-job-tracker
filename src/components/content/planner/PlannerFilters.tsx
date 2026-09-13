"use client";

import { SlidersHorizontal, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import PlatformIcon, { getPlatformLabel } from "@/components/content/PlatformIcon";
import { ALL_PLATFORMS, STATUS_FILTERS, STATUS_META, type StatusKey } from "./planner-utils";

export interface PlannerFilterState {
  clientId: string;
  platforms: string[];
  statuses: StatusKey[];
  assigneeId: string;
  mine: boolean;
}

export const EMPTY_FILTERS: PlannerFilterState = { clientId: "", platforms: [], statuses: [], assigneeId: "", mine: false };

const selectClass =
  "bg-bb-elevated border border-bb-border rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-bb-orange/60 cursor-pointer max-w-full";

export default function PlannerFilters({
  value,
  onChange,
  clients,
  users,
  hideStatus = false,
}: {
  value: PlannerFilterState;
  onChange: (next: PlannerFilterState) => void;
  clients: { id: string; name: string }[];
  users: { id: string; name: string }[];
  hideStatus?: boolean;
}) {
  const active =
    !!value.clientId || value.platforms.length > 0 || value.statuses.length > 0 || !!value.assigneeId || value.mine;

  const togglePlatform = (p: string) =>
    onChange({
      ...value,
      platforms: value.platforms.includes(p) ? value.platforms.filter((x) => x !== p) : [...value.platforms, p],
    });

  const toggleStatus = (s: StatusKey) =>
    onChange({
      ...value,
      statuses: value.statuses.includes(s) ? value.statuses.filter((x) => x !== s) : [...value.statuses, s],
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal size={14} className="text-bb-dim hidden sm:block" aria-hidden />
        <select
          aria-label="Client"
          value={value.clientId}
          onChange={(e) => onChange({ ...value, clientId: e.target.value })}
          className={selectClass}
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Assignee"
          value={value.mine ? "" : value.assigneeId}
          disabled={value.mine}
          onChange={(e) => onChange({ ...value, assigneeId: e.target.value })}
          className={cn(selectClass, value.mine && "opacity-50")}
        >
          <option value="">Anyone assigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-pressed={value.mine}
          onClick={() => onChange({ ...value, mine: !value.mine })}
          className={cn(
            "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer",
            value.mine
              ? "bg-bb-orange/10 text-bb-orange border-bb-orange/30"
              : "bg-bb-elevated text-bb-muted border-bb-border hover:text-white"
          )}
        >
          <User size={12} /> Mine
        </button>
        {active && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-bb-dim hover:text-white transition-colors cursor-pointer"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
        {ALL_PLATFORMS.map((p) => {
          const on = value.platforms.includes(p);
          return (
            <button
              key={p}
              type="button"
              aria-pressed={on}
              onClick={() => togglePlatform(p)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border whitespace-nowrap shrink-0 transition-colors cursor-pointer",
                on ? "bg-bb-orange/10 text-bb-orange border-bb-orange/30" : "text-bb-muted hover:text-white bg-bb-elevated border-bb-border"
              )}
            >
              <PlatformIcon platform={p} size={12} />
              <span className="hidden sm:inline">{getPlatformLabel(p)}</span>
            </button>
          );
        })}
        {!hideStatus && <span className="w-px h-5 bg-bb-border mx-1 shrink-0" aria-hidden />}
        {!hideStatus &&
          STATUS_FILTERS.map((s) => {
            const on = value.statuses.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => toggleStatus(s)}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border whitespace-nowrap shrink-0 transition-colors cursor-pointer",
                  on ? STATUS_META[s].badge : "text-bb-muted hover:text-white bg-bb-elevated border-bb-border"
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_META[s].dot)} aria-hidden />
                {STATUS_META[s].label}
              </button>
            );
          })}
      </div>
    </div>
  );
}
