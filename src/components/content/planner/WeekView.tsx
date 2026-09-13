"use client";

import { useEffect, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import { format, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { WeekBlock } from "./GroupCard";
import type { PlannerPost, PostGroup } from "./planner-utils";

/** Pixel height of one hour row; drop math in CalendarTab depends on it. */
export const HOUR_PX = 48;
const BLOCK_MINUTES = 50; // visual height of a post block, for overlap lanes

export function weekDayId(day: Date) {
  return `wday:${format(day, "yyyy-MM-dd")}`;
}

/** Side-by-side lanes for posts whose blocks would overlap. */
function layout(groups: PostGroup[]) {
  const sorted = [...groups].filter((g) => g.date).sort((a, b) => a.date!.getTime() - b.date!.getTime());
  const laneEnds: number[] = [];
  const placed = sorted.map((g) => {
    const start = g.date!.getHours() * 60 + g.date!.getMinutes();
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = start + BLOCK_MINUTES;
    return { group: g, start, lane };
  });
  return { placed, lanes: Math.max(1, laneEnds.length) };
}

function DayColumn({
  day,
  groups,
  onCreateAt,
  onOpen,
}: {
  day: Date;
  groups: PostGroup[];
  onCreateAt: (when: Date) => void;
  onOpen: (post: PlannerPost) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: weekDayId(day), data: { day } });
  const { placed, lanes } = layout(groups);
  return (
    <div
      ref={setNodeRef}
      className={cn("relative border-l border-bb-border", isOver && "bg-bb-orange/5")}
      style={{ height: HOUR_PX * 24 }}
      onClick={(e) => {
        // Empty-slot click: new post at that time, snapped to 15 minutes
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const minutes = Math.max(0, Math.min(23 * 60 + 45, Math.floor(((e.clientY - rect.top) / HOUR_PX) * 4) * 15));
        const when = new Date(day);
        when.setHours(0, minutes, 0, 0);
        onCreateAt(when);
      }}
    >
      {Array.from({ length: 24 }, (_, h) => (
        <div
          key={h}
          className="absolute inset-x-0 border-t border-bb-border/50 hover:bg-white/[0.02] cursor-pointer"
          style={{ top: h * HOUR_PX, height: HOUR_PX }}
        />
      ))}
      {isToday(day) && <NowLine />}
      {placed.map(({ group, start, lane }) => (
        <div
          key={group.key}
          className="absolute px-0.5"
          style={{
            top: (start / 60) * HOUR_PX,
            height: (BLOCK_MINUTES / 60) * HOUR_PX,
            left: `${(lane / lanes) * 100}%`,
            width: `${100 / lanes}%`,
          }}
        >
          <WeekBlock group={group} onOpen={onOpen} />
        </div>
      ))}
    </div>
  );
}

function NowLine() {
  const now = new Date();
  const top = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX;
  return (
    <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top }}>
      <div className="h-px bg-bb-orange" />
      <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-bb-orange" />
    </div>
  );
}

export default function WeekView({
  days,
  groupsByDay,
  timezoneLabel,
  onCreateAt,
  onOpen,
}: {
  days: Date[];
  groupsByDay: Map<string, PostGroup[]>;
  timezoneLabel: string;
  onCreateAt: (when: Date) => void;
  onOpen: (post: PlannerPost) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Start the view at 7am rather than midnight
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = HOUR_PX * 7;
  }, []);

  return (
    <div className="border border-bb-border rounded-lg bg-bb-surface overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b border-bb-border">
            <div className="text-[9px] leading-tight text-bb-dim p-1 self-end" title={timezoneLabel}>
              {timezoneLabel.split(" (")[1]?.replace(")", "") || "Local"}
            </div>
            {days.map((day) => (
              <div key={day.toISOString()} className="border-l border-bb-border px-2 py-1.5 text-center">
                <div className="text-[11px] text-bb-dim">{format(day, "EEE")}</div>
                <div
                  className={cn(
                    "mx-auto mt-0.5 w-7 h-7 rounded-full flex items-center justify-center text-sm tabular-nums",
                    isToday(day) ? "bg-bb-orange text-white font-semibold" : "text-white"
                  )}
                >
                  {format(day, "d")}
                </div>
              </div>
            ))}
          </div>
          <div ref={scrollRef} className="max-h-[68vh] overflow-y-auto overscroll-contain">
            <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))]">
              <div className="relative" style={{ height: HOUR_PX * 24 }} aria-hidden>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="absolute right-1.5 text-[10px] text-bb-dim tabular-nums -translate-y-1/2" style={{ top: h * HOUR_PX }}>
                    {h === 0 ? "" : format(new Date(2000, 0, 1, h), "ha").toLowerCase()}
                  </div>
                ))}
              </div>
              {days.map((day) => (
                <DayColumn
                  key={day.toISOString()}
                  day={day}
                  groups={groupsByDay.get(format(day, "yyyy-MM-dd")) || []}
                  onCreateAt={onCreateAt}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
