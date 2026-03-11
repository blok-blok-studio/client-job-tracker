"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, List } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import Badge from "@/components/shared/Badge";
import { cn, formatRelativeDate } from "@/lib/utils";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  addDays,
} from "date-fns";

interface CalendarTask {
  id: string;
  title: string;
  dueDate: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  clientName: string | null;
}

const priorityDot: Record<string, string> = {
  URGENT: "bg-red-500",
  HIGH: "bg-bb-orange",
  MEDIUM: "bg-blue-500",
  LOW: "bg-bb-dim",
};

export default function CalendarPage() {
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [mode, setMode] = useState<"calendar" | "timeline">("calendar");

  const fetchTasks = useCallback(async () => {
    const res = await fetch("/api/tasks");
    const data = await res.json();
    if (data.success) {
      setTasks(
        data.data
          .filter((t: Record<string, unknown>) => t.dueDate && t.status !== "DONE")
          .map((t: Record<string, unknown>) => ({
            id: t.id,
            title: t.title,
            dueDate: t.dueDate as string,
            priority: t.priority as string,
            status: t.status as string,
            assignedTo: t.assignedTo as string | null,
            clientName: (t.client as Record<string, string> | null)?.name || null,
          }))
      );
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  function getTasksForDay(day: Date) {
    return tasks.filter((t) => isSameDay(new Date(t.dueDate), day));
  }

  function getSelectedDayTasks() {
    if (!selectedDay) return [];
    return getTasksForDay(selectedDay);
  }

  // Timeline: group by week for next 90 days
  function getTimelineData() {
    const now = new Date();
    const overdue = tasks.filter((t) => new Date(t.dueDate) < now);
    const upcoming = tasks
      .filter((t) => new Date(t.dueDate) >= now && new Date(t.dueDate) <= addDays(now, 90))
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    // Group by week
    const weeks: Record<string, CalendarTask[]> = {};
    upcoming.forEach((t) => {
      const weekStart = startOfWeek(new Date(t.dueDate));
      const key = format(weekStart, "MMM d");
      if (!weeks[key]) weeks[key] = [];
      weeks[key].push(t);
    });

    return { overdue, weeks };
  }

  return (
    <div>
      <TopBar title="Calendar" subtitle="Deadlines and scheduling" />
      <div className="px-6 pb-8">
        {/* Controls */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1 bg-bb-surface border border-bb-border rounded-lg p-1">
            <button
              onClick={() => setMode("calendar")}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md", mode === "calendar" ? "bg-bb-orange text-white" : "text-bb-muted hover:text-white")}
            >
              <CalendarIcon size={14} /> Calendar
            </button>
            <button
              onClick={() => setMode("timeline")}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md", mode === "timeline" ? "bg-bb-orange text-white" : "text-bb-muted hover:text-white")}
            >
              <List size={14} /> Timeline
            </button>
          </div>

          {mode === "calendar" && (
            <div className="flex items-center gap-3">
              <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 rounded hover:bg-bb-elevated text-bb-muted"><ChevronLeft size={18} /></button>
              <h2 className="font-display font-semibold text-lg w-40 text-center">{format(currentMonth, "MMMM yyyy")}</h2>
              <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 rounded hover:bg-bb-elevated text-bb-muted"><ChevronRight size={18} /></button>
              <button onClick={() => { setCurrentMonth(new Date()); setSelectedDay(new Date()); }} className="px-3 py-1 text-sm bg-bb-elevated hover:bg-bb-border rounded text-bb-muted">Today</button>
            </div>
          )}
        </div>

        {mode === "calendar" ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Calendar Grid */}
            <div className="lg:col-span-3 bg-bb-surface border border-bb-border rounded-lg p-4">
              <div className="grid grid-cols-7 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="text-center text-xs text-bb-dim py-2">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px bg-bb-border">
                {calendarDays.map((day) => {
                  const dayTasks = getTasksForDay(day);
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isSelected = selectedDay && isSameDay(day, selectedDay);
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDay(day)}
                      className={cn(
                        "bg-bb-surface p-2 min-h-[80px] text-left hover:bg-bb-elevated transition-colors",
                        !isCurrentMonth && "opacity-30",
                        isSelected && "ring-2 ring-bb-orange",
                        isToday(day) && "bg-bb-elevated"
                      )}
                    >
                      <span className={cn("text-xs font-mono", isToday(day) ? "text-bb-orange font-bold" : "text-bb-dim")}>
                        {format(day, "d")}
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {dayTasks.slice(0, 3).map((t) => (
                          <span key={t.id} className={`w-1.5 h-1.5 rounded-full ${priorityDot[t.priority] || "bg-bb-dim"}`} />
                        ))}
                        {dayTasks.length > 3 && <span className="text-[9px] text-bb-dim">+{dayTasks.length - 3}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Day Panel */}
            <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
              <h3 className="font-display font-semibold mb-3">
                {selectedDay ? format(selectedDay, "EEEE, MMM d") : "Select a day"}
              </h3>
              <div className="space-y-2">
                {getSelectedDayTasks().map((t) => (
                  <div key={t.id} className="p-2 rounded bg-bb-black border border-bb-border">
                    <p className="text-sm font-medium">{t.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {t.clientName && <Badge variant="default" size="sm">{t.clientName}</Badge>}
                      <Badge variant={t.priority === "URGENT" ? "red" : t.priority === "HIGH" ? "orange" : "blue"} size="sm">{t.priority}</Badge>
                    </div>
                  </div>
                ))}
                {selectedDay && getSelectedDayTasks().length === 0 && (
                  <p className="text-sm text-bb-dim">No tasks due</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Timeline Mode */
          <div className="space-y-6">
            {(() => {
              const { overdue, weeks } = getTimelineData();
              return (
                <>
                  {overdue.length > 0 && (
                    <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                      <h3 className="text-red-400 font-display font-semibold mb-3">Overdue</h3>
                      <div className="space-y-2">
                        {overdue.map((t) => (
                          <div key={t.id} className="flex items-center justify-between p-2 rounded bg-bb-black/50">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${priorityDot[t.priority]}`} />
                              <span className="text-sm">{t.title}</span>
                              {t.clientName && <Badge variant="default" size="sm">{t.clientName}</Badge>}
                            </div>
                            <span className="text-xs text-red-400">{formatRelativeDate(new Date(t.dueDate))}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {Object.entries(weeks).map(([weekLabel, weekTasks]) => (
                    <div key={weekLabel} className="bg-bb-surface border border-bb-border rounded-lg p-4">
                      <h3 className="font-display font-semibold text-bb-muted mb-3">Week of {weekLabel}</h3>
                      <div className="space-y-2">
                        {weekTasks.map((t) => (
                          <div key={t.id} className="flex items-center justify-between p-2 rounded hover:bg-bb-elevated">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${priorityDot[t.priority]}`} />
                              <span className="text-sm">{t.title}</span>
                              {t.clientName && <Badge variant="default" size="sm">{t.clientName}</Badge>}
                              <Badge variant="gray" size="sm">{t.status.replace("_", " ")}</Badge>
                            </div>
                            <span className="text-xs text-bb-dim">{format(new Date(t.dueDate), "EEE, MMM d")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {overdue.length === 0 && Object.keys(weeks).length === 0 && (
                    <div className="text-center py-12 text-bb-dim">No upcoming deadlines in the next 90 days</div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
