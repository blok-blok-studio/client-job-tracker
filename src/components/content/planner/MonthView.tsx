"use client";

import { useDroppable } from "@dnd-kit/core";
import { format, isSameMonth, isToday } from "date-fns";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { MonthChip } from "./GroupCard";
import type { PlannerPost, PostGroup } from "./planner-utils";

export function dayId(day: Date) {
  return `day:${format(day, "yyyy-MM-dd")}`;
}

function DayCell({
  day,
  month,
  groups,
  selected,
  onSelect,
  onCreate,
  onOpen,
}: {
  day: Date;
  month: Date;
  groups: PostGroup[];
  selected: boolean;
  onSelect: (day: Date) => void;
  onCreate: (day: Date) => void;
  onOpen: (post: PlannerPost) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayId(day), data: { day } });
  const visible = groups.slice(0, 3);
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      tabIndex={0}
      aria-label={`${format(day, "EEEE MMMM d")}, ${groups.length} post${groups.length === 1 ? "" : "s"}`}
      onClick={() => onSelect(day)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(day);
        }
      }}
      className={cn(
        "group/day relative bg-bb-surface min-h-[64px] sm:min-h-[92px] lg:min-h-[112px] p-1 flex flex-col gap-0.5 transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-bb-orange",
        !isSameMonth(day, month) && "bg-bb-black/60",
        selected && "ring-1 ring-inset ring-bb-orange",
        isOver && "bg-bb-orange/10 ring-1 ring-inset ring-bb-orange/60"
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full text-[10px] sm:text-xs tabular-nums",
            isToday(day) ? "bg-bb-orange text-white font-semibold" : isSameMonth(day, month) ? "text-bb-muted" : "text-bb-dim/70"
          )}
        >
          {format(day, "d")}
        </span>
        <button
          type="button"
          aria-label={`New post on ${format(day, "MMMM d")}`}
          onClick={(e) => {
            e.stopPropagation();
            onCreate(day);
          }}
          className="w-5 h-5 rounded-full hidden sm:flex items-center justify-center text-bb-dim hover:text-bb-orange hover:bg-bb-orange/10 opacity-0 group-hover/day:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
        >
          <Plus size={12} />
        </button>
      </div>
      {/* Phones: dots only; wider: time + snippet chips */}
      <div className="flex sm:hidden flex-wrap gap-0.5">
        {groups.slice(0, 4).map((g) => (
          <span key={g.key} className="w-1.5 h-1.5 rounded-full bg-bb-orange/80" />
        ))}
      </div>
      <div className="hidden sm:flex flex-col gap-0.5 min-w-0">
        {visible.map((g) => (
          <MonthChip key={g.key} group={g} onOpen={onOpen} />
        ))}
        {groups.length > visible.length && (
          <span className="text-[10px] text-bb-dim px-1">+{groups.length - visible.length} more</span>
        )}
      </div>
    </div>
  );
}

export default function MonthView({
  month,
  days,
  groupsByDay,
  selectedDay,
  onSelectDay,
  onCreate,
  onOpen,
}: {
  month: Date;
  days: Date[];
  groupsByDay: Map<string, PostGroup[]>;
  selectedDay: Date | null;
  onSelectDay: (day: Date) => void;
  onCreate: (day: Date) => void;
  onOpen: (post: PlannerPost) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-7 mb-1" aria-hidden>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-center text-[11px] font-medium text-bb-dim py-1.5">
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{d[0]}</span>
          </div>
        ))}
      </div>
      <div role="grid" className="grid grid-cols-7 gap-px bg-bb-border rounded-lg overflow-hidden border border-bb-border">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          return (
            <DayCell
              key={key}
              day={day}
              month={month}
              groups={groupsByDay.get(key) || []}
              selected={!!selectedDay && format(selectedDay, "yyyy-MM-dd") === key}
              onSelect={onSelectDay}
              onCreate={onCreate}
              onOpen={onOpen}
            />
          );
        })}
      </div>
    </div>
  );
}
