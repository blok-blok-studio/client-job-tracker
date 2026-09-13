"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Columns3, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import MonthView from "./MonthView";
import WeekView, { HOUR_PX } from "./WeekView";
import { GroupCard, MonthChip } from "./GroupCard";
import AccountStack from "./AccountStack";
import { localTimezoneLabel, postSnippet, withDay, type PlannerPost, type PostGroup } from "./planner-utils";

export type CalendarMode = "month" | "week";

export default function CalendarTab({
  groups,
  anchor,
  onAnchorChange,
  mode,
  onModeChange,
  onOpen,
  onCreate,
  onRetry,
  onReschedule,
  onDragStateChange,
}: {
  groups: PostGroup[];
  anchor: Date;
  onAnchorChange: (d: Date) => void;
  mode: CalendarMode;
  onModeChange: (m: CalendarMode) => void;
  onOpen: (post: PlannerPost) => void;
  onCreate: (when: Date) => void;
  onRetry: (post: PlannerPost) => void;
  onReschedule: (group: PostGroup, when: Date) => void;
  onDragStateChange: (dragging: boolean) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [dragging, setDragging] = useState<PostGroup | null>(null);
  const timezoneLabel = useMemo(() => localTimezoneLabel(), []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const days = useMemo(() => {
    if (mode === "week") {
      const start = startOfWeek(anchor, { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end: addDays(start, 6) });
    }
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }),
    });
  }, [anchor, mode]);

  const { unscheduled, groupsByDay } = useMemo(() => {
    const byDay = new Map<string, PostGroup[]>();
    const without: PostGroup[] = [];
    for (const g of groups) {
      if (!g.date) {
        without.push(g);
        continue;
      }
      const key = format(g.date, "yyyy-MM-dd");
      byDay.set(key, [...(byDay.get(key) || []), g]);
    }
    for (const list of byDay.values()) list.sort((a, b) => a.date!.getTime() - b.date!.getTime());
    return { unscheduled: without, groupsByDay: byDay };
  }, [groups]);

  const selectedGroups = selectedDay ? groupsByDay.get(format(selectedDay, "yyyy-MM-dd")) || [] : [];

  const title =
    mode === "month"
      ? format(anchor, "MMMM yyyy")
      : `${format(days[0], "MMM d")} to ${format(days[6], days[0].getMonth() === days[6].getMonth() ? "d, yyyy" : "MMM d, yyyy")}`;

  const shift = (dir: -1 | 1) => {
    if (mode === "month") onAnchorChange(dir === 1 ? addMonths(anchor, 1) : subMonths(anchor, 1));
    else onAnchorChange(dir === 1 ? addWeeks(anchor, 1) : subWeeks(anchor, 1));
  };

  const handleDragStart = (e: DragStartEvent) => {
    setDragging((e.active.data.current?.group as PostGroup) || null);
    onDragStateChange(true);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    onDragStateChange(false);
    const group = e.active.data.current?.group as PostGroup | undefined;
    const overId = e.over?.id ? String(e.over.id) : "";
    const day = e.over?.data.current?.day as Date | undefined;
    if (!group || !day) return;

    let when: Date;
    if (overId.startsWith("wday:")) {
      // Week grid: vertical drop position picks the time, snapped to 15 minutes
      const top = e.active.rect.current.translated?.top ?? 0;
      const minutes = Math.round((((top - e.over!.rect.top) / HOUR_PX) * 60) / 15) * 15;
      when = new Date(day);
      when.setHours(0, Math.max(0, Math.min(23 * 60 + 45, minutes)), 0, 0);
    } else {
      // Month grid: same time of day on the new date (9am for undated drafts)
      const base = group.date || new Date(new Date().setHours(9, 0, 0, 0));
      when = withDay(base, day);
    }
    if (group.date && group.date.getTime() === when.getTime()) return;
    onReschedule(group, when);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setDragging(null);
        onDragStateChange(false);
      }}
    >
      <div className="flex flex-col xl:flex-row gap-4">
        <div className="flex-1 min-w-0 space-y-3">
          {/* Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous"
                onClick={() => shift(-1)}
                className="p-1.5 rounded-lg text-bb-muted hover:text-white hover:bg-bb-elevated transition-colors cursor-pointer"
              >
                <ChevronLeft size={18} />
              </button>
              <h2 className="font-display text-base sm:text-lg font-semibold text-white min-w-[9rem] text-center">{title}</h2>
              <button
                type="button"
                aria-label="Next"
                onClick={() => shift(1)}
                className="p-1.5 rounded-lg text-bb-muted hover:text-white hover:bg-bb-elevated transition-colors cursor-pointer"
              >
                <ChevronRight size={18} />
              </button>
              <button
                type="button"
                onClick={() => {
                  onAnchorChange(new Date());
                  setSelectedDay(new Date());
                }}
                className="ml-1 px-2.5 py-1 rounded-md text-xs bg-bb-elevated text-bb-muted hover:text-white border border-bb-border transition-colors cursor-pointer"
              >
                Today
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden md:inline text-[11px] text-bb-dim">Times in {timezoneLabel}</span>
              <div className="flex bg-bb-elevated rounded-lg p-0.5 border border-bb-border">
                {(
                  [
                    ["month", "Month", CalendarDays],
                    ["week", "Week", Columns3],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onModeChange(key)}
                    aria-pressed={mode === key}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer",
                      mode === key ? "bg-bb-surface text-white shadow-card" : "text-bb-muted hover:text-white"
                    )}
                  >
                    <Icon size={13} /> {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {mode === "month" ? (
            <MonthView
              month={anchor}
              days={days}
              groupsByDay={groupsByDay}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              onCreate={(day) => {
                const when = new Date(day);
                when.setHours(9, 0, 0, 0);
                onCreate(when);
              }}
              onOpen={onOpen}
            />
          ) : (
            <WeekView days={days} groupsByDay={groupsByDay} timezoneLabel={timezoneLabel} onCreateAt={onCreate} onOpen={onOpen} />
          )}

          <p className="text-[11px] text-bb-dim">
            Drag a post to move it. Posts that are publishing or already out stay put.
            <span className="md:hidden"> Times in {timezoneLabel}.</span>
          </p>

          {unscheduled.length > 0 && (
            <div className="bg-bb-surface border border-bb-border rounded-xl p-3">
              <h3 className="text-xs font-semibold text-bb-muted mb-2">
                Drafts without a date <span className="text-bb-dim font-normal">({unscheduled.length}) · drag onto a day to schedule</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {unscheduled.slice(0, 12).map((g) => (
                  <div key={g.key} className="flex items-center gap-2 min-w-0">
                    <div className="flex-1 min-w-0">
                      <MonthChip group={g} onOpen={onOpen} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Day panel: side column on wide screens, bottom sheet on phones */}
        {mode === "month" && (
          <aside className="hidden xl:block w-80 shrink-0">
            <DayPanel day={selectedDay} groups={selectedGroups} onOpen={onOpen} onRetry={onRetry} onCreate={onCreate} />
          </aside>
        )}
        {mode === "month" && selectedDay && (
          <div className="xl:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={format(selectedDay, "EEEE MMMM d")}>
            <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedDay(null)} />
            <div className="absolute bottom-0 inset-x-0 bg-bb-surface border-t border-bb-border rounded-t-2xl max-h-[75vh] overflow-y-auto p-4 animate-fade-in-up">
              <DayPanel
                day={selectedDay}
                groups={selectedGroups}
                onOpen={(p) => {
                  setSelectedDay(null);
                  onOpen(p);
                }}
                onRetry={onRetry}
                onCreate={(d) => {
                  setSelectedDay(null);
                  onCreate(d);
                }}
                onClose={() => setSelectedDay(null)}
                bare
              />
            </div>
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="rounded-md bg-bb-elevated border border-bb-orange/60 shadow-modal px-2 py-1 flex items-center gap-2 max-w-[220px] cursor-grabbing">
            <AccountStack posts={dragging.posts} size="xs" max={3} />
            <span className="text-[11px] text-white truncate">{postSnippet(dragging.lead, 40)}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DayPanel({
  day,
  groups,
  onOpen,
  onRetry,
  onCreate,
  onClose,
  bare = false,
}: {
  day: Date | null;
  groups: PostGroup[];
  onOpen: (post: PlannerPost) => void;
  onRetry: (post: PlannerPost) => void;
  onCreate: (when: Date) => void;
  onClose?: () => void;
  bare?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">{day ? format(day, "EEEE, MMM d") : "Pick a day"}</h3>
        {onClose && (
          <button type="button" aria-label="Close" onClick={onClose} className="p-1.5 rounded-lg bg-bb-elevated text-bb-muted hover:text-white cursor-pointer">
            <X size={15} />
          </button>
        )}
      </div>
      {!day && <p className="text-sm text-bb-dim">Click a day to see its posts.</p>}
      {day && groups.length === 0 && <p className="text-sm text-bb-dim">Nothing planned.</p>}
      <div className="space-y-2">
        {groups.map((g) => (
          <GroupCard key={g.key} group={g} onOpen={onOpen} onRetry={onRetry} />
        ))}
      </div>
      {day && (
        <button
          type="button"
          onClick={() => {
            const when = isSameDay(day, new Date()) ? nextHour() : new Date(new Date(day).setHours(9, 0, 0, 0));
            onCreate(when);
          }}
          className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-bb-orange/10 border border-bb-orange/30 rounded-lg text-sm text-bb-orange hover:bg-bb-orange/20 transition-colors cursor-pointer"
        >
          <Plus size={14} /> New post
        </button>
      )}
    </>
  );
  if (bare) return body;
  return <div className="bg-bb-surface border border-bb-border rounded-xl p-4 sticky top-4">{body}</div>;
}

function nextHour() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}
