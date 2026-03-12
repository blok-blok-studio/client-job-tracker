"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  List,
  Video,
  Clock,
  Users,
  ExternalLink,
} from "lucide-react";
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
  subDays,
  parseISO,
} from "date-fns";

interface CalendarTask {
  id: string;
  title: string;
  dueDate: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  clientName: string | null;
  type: "task";
}

interface CalBooking {
  id: number;
  uid: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
  status: string;
  attendees: Array<{ name: string; email: string }>;
  location: string | null;
  meetingUrl: string | null;
  type: "booking";
}

type CalendarItem = CalendarTask | CalBooking;

const priorityDot: Record<string, string> = {
  URGENT: "bg-red-500",
  HIGH: "bg-bb-orange",
  MEDIUM: "bg-blue-500",
  LOW: "bg-bb-dim",
};

export default function CalendarPage() {
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [bookings, setBookings] = useState<CalBooking[]>([]);
  const [calConfigured, setCalConfigured] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [mode, setMode] = useState<"calendar" | "timeline">("calendar");
  const [filter, setFilter] = useState<"all" | "tasks" | "bookings">("all");
  const [loading, setLoading] = useState(true);

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
            type: "task" as const,
          }))
      );
    }
  }, []);

  const fetchBookings = useCallback(async () => {
    try {
      // Fetch 3 months of bookings centered on current month
      const start = subDays(startOfMonth(currentMonth), 30);
      const end = addDays(endOfMonth(currentMonth), 30);

      const res = await fetch(
        `/api/calendar?afterStart=${start.toISOString()}&beforeEnd=${end.toISOString()}`
      );
      const data = await res.json();
      if (data.success) {
        setCalConfigured(data.configured);
        setBookings(
          (data.data || []).map((b: Record<string, unknown>) => ({
            ...b,
            type: "booking" as const,
          }))
        );
      }
    } catch {
      // Cal.com not configured or API error — gracefully degrade
    }
  }, [currentMonth]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchTasks(), fetchBookings()]).finally(() => setLoading(false));
  }, [fetchTasks, fetchBookings]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  function getItemsForDay(day: Date): CalendarItem[] {
    const items: CalendarItem[] = [];
    if (filter !== "bookings") {
      items.push(...tasks.filter((t) => isSameDay(new Date(t.dueDate), day)));
    }
    if (filter !== "tasks") {
      items.push(...bookings.filter((b) => isSameDay(parseISO(b.start), day)));
    }
    return items;
  }

  function getSelectedDayItems(): CalendarItem[] {
    if (!selectedDay) return [];
    return getItemsForDay(selectedDay);
  }

  // Timeline: group by week for next 90 days
  function getTimelineData() {
    const now = new Date();

    const overdueTasks =
      filter !== "bookings"
        ? tasks.filter((t) => new Date(t.dueDate) < now)
        : [];

    const upcomingTasks =
      filter !== "bookings"
        ? tasks
            .filter(
              (t) =>
                new Date(t.dueDate) >= now &&
                new Date(t.dueDate) <= addDays(now, 90)
            )
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        : [];

    const upcomingBookings =
      filter !== "tasks"
        ? bookings
            .filter(
              (b) =>
                new Date(b.start) >= now &&
                new Date(b.start) <= addDays(now, 90)
            )
            .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
        : [];

    // Group all items by week
    const weeks: Record<string, CalendarItem[]> = {};

    [...upcomingTasks, ...upcomingBookings]
      .sort((a, b) => {
        const dateA = a.type === "task" ? a.dueDate : a.start;
        const dateB = b.type === "task" ? b.dueDate : b.start;
        return new Date(dateA).getTime() - new Date(dateB).getTime();
      })
      .forEach((item) => {
        const date = item.type === "task" ? item.dueDate : item.start;
        const weekStart = startOfWeek(new Date(date));
        const key = format(weekStart, "MMM d");
        if (!weeks[key]) weeks[key] = [];
        weeks[key].push(item);
      });

    return { overdue: overdueTasks, weeks };
  }

  return (
    <div>
      <TopBar title="Calendar" subtitle="Tasks, deadlines & appointments" />
      <div className="px-4 lg:px-6 pb-8">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center gap-1 bg-bb-surface border border-bb-border rounded-lg p-1">
              <button
                onClick={() => setMode("calendar")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md",
                  mode === "calendar"
                    ? "bg-bb-orange text-white"
                    : "text-bb-muted hover:text-white"
                )}
              >
                <CalendarIcon size={14} /> Calendar
              </button>
              <button
                onClick={() => setMode("timeline")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md",
                  mode === "timeline"
                    ? "bg-bb-orange text-white"
                    : "text-bb-muted hover:text-white"
                )}
              >
                <List size={14} /> Timeline
              </button>
            </div>

            {/* Filter toggle */}
            <div className="flex items-center gap-1 bg-bb-surface border border-bb-border rounded-lg p-1">
              <button
                onClick={() => setFilter("all")}
                className={cn(
                  "px-2.5 py-1.5 text-xs rounded-md",
                  filter === "all"
                    ? "bg-bb-elevated text-white"
                    : "text-bb-dim hover:text-white"
                )}
              >
                All
              </button>
              <button
                onClick={() => setFilter("tasks")}
                className={cn(
                  "px-2.5 py-1.5 text-xs rounded-md",
                  filter === "tasks"
                    ? "bg-bb-elevated text-white"
                    : "text-bb-dim hover:text-white"
                )}
              >
                Tasks
              </button>
              <button
                onClick={() => setFilter("bookings")}
                className={cn(
                  "px-2.5 py-1.5 text-xs rounded-md flex items-center gap-1",
                  filter === "bookings"
                    ? "bg-bb-elevated text-white"
                    : "text-bb-dim hover:text-white"
                )}
              >
                <Video size={12} /> Cal.com
              </button>
            </div>
          </div>

          {mode === "calendar" && (
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="p-1.5 rounded hover:bg-bb-elevated text-bb-muted"
              >
                <ChevronLeft size={18} />
              </button>
              <h2 className="font-display font-semibold text-sm sm:text-lg w-28 sm:w-40 text-center">
                {format(currentMonth, "MMM yyyy")}
              </h2>
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="p-1.5 rounded hover:bg-bb-elevated text-bb-muted"
              >
                <ChevronRight size={18} />
              </button>
              <button
                onClick={() => {
                  setCurrentMonth(new Date());
                  setSelectedDay(new Date());
                }}
                className="px-3 py-1 text-sm bg-bb-elevated hover:bg-bb-border rounded text-bb-muted"
              >
                Today
              </button>
            </div>
          )}
        </div>

        {/* Cal.com setup notice */}
        {!calConfigured && !loading && (
          <div className="mb-4 p-3 bg-bb-surface border border-bb-border rounded-lg flex items-center gap-3">
            <Video size={16} className="text-bb-dim shrink-0" />
            <p className="text-xs text-bb-dim">
              Connect Cal.com to see your appointments here. Add your{" "}
              <code className="text-bb-muted bg-bb-black px-1 rounded">CALCOM_API_KEY</code>{" "}
              to environment variables.
            </p>
          </div>
        )}

        {mode === "calendar" ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Calendar Grid */}
            <div className="lg:col-span-3 bg-bb-surface border border-bb-border rounded-lg p-2 sm:p-4">
              <div className="grid grid-cols-7 mb-2">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <div key={i} className="text-center text-xs text-bb-dim py-2 sm:hidden">
                    {d}
                  </div>
                ))}
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="text-center text-xs text-bb-dim py-2 hidden sm:block">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px bg-bb-border">
                {calendarDays.map((day) => {
                  const dayItems = getItemsForDay(day);
                  const dayTasks = dayItems.filter((i) => i.type === "task");
                  const dayBookings = dayItems.filter((i) => i.type === "booking");
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isSelected = selectedDay && isSameDay(day, selectedDay);
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDay(day)}
                      className={cn(
                        "bg-bb-surface p-1 sm:p-2 min-h-[48px] sm:min-h-[80px] text-left hover:bg-bb-elevated transition-colors",
                        !isCurrentMonth && "opacity-30",
                        isSelected && "ring-2 ring-bb-orange",
                        isToday(day) && "bg-bb-elevated"
                      )}
                    >
                      <span
                        className={cn(
                          "text-xs font-mono",
                          isToday(day) ? "text-bb-orange font-bold" : "text-bb-dim"
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {/* Task dots */}
                        {dayTasks.slice(0, 2).map((t) => (
                          <span
                            key={t.id}
                            className={`w-1.5 h-1.5 rounded-full ${
                              priorityDot[(t as CalendarTask).priority] || "bg-bb-dim"
                            }`}
                          />
                        ))}
                        {/* Booking dots */}
                        {dayBookings.slice(0, 2).map((b) => (
                          <span
                            key={(b as CalBooking).uid}
                            className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                          />
                        ))}
                        {dayItems.length > 4 && (
                          <span className="text-[9px] text-bb-dim">
                            +{dayItems.length - 4}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 px-2">
                <div className="flex items-center gap-1.5 text-[10px] text-bb-dim">
                  <span className="w-2 h-2 rounded-full bg-red-500" /> Urgent
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-bb-dim">
                  <span className="w-2 h-2 rounded-full bg-bb-orange" /> High
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-bb-dim">
                  <span className="w-2 h-2 rounded-full bg-blue-500" /> Medium
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-bb-dim">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Appointment
                </div>
              </div>
            </div>

            {/* Selected Day Panel */}
            <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
              <h3 className="font-display font-semibold mb-3">
                {selectedDay ? format(selectedDay, "EEEE, MMM d") : "Select a day"}
              </h3>
              <div className="space-y-2">
                {getSelectedDayItems().map((item) => {
                  if (item.type === "task") {
                    const t = item as CalendarTask;
                    return (
                      <div
                        key={t.id}
                        className="p-2 rounded bg-bb-black border border-bb-border"
                      >
                        <p className="text-sm font-medium">{t.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {t.clientName && (
                            <Badge variant="default" size="sm">
                              {t.clientName}
                            </Badge>
                          )}
                          <Badge
                            variant={
                              t.priority === "URGENT"
                                ? "red"
                                : t.priority === "HIGH"
                                ? "orange"
                                : "blue"
                            }
                            size="sm"
                          >
                            {t.priority}
                          </Badge>
                        </div>
                      </div>
                    );
                  } else {
                    const b = item as CalBooking;
                    return (
                      <div
                        key={b.uid}
                        className="p-2 rounded bg-bb-black border border-emerald-500/30"
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <Video size={12} className="text-emerald-400" />
                          <p className="text-sm font-medium">{b.title}</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-bb-dim">
                          <Clock size={10} />
                          <span>
                            {format(parseISO(b.start), "h:mm a")} –{" "}
                            {format(parseISO(b.end), "h:mm a")}
                          </span>
                        </div>
                        {b.attendees && b.attendees.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-1 text-xs text-bb-dim">
                            <Users size={10} />
                            <span>{b.attendees.map((a) => a.name).join(", ")}</span>
                          </div>
                        )}
                        {b.meetingUrl && (
                          <a
                            href={b.meetingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-1.5 text-xs text-emerald-400 hover:text-emerald-300"
                          >
                            <ExternalLink size={10} /> Join Meeting
                          </a>
                        )}
                      </div>
                    );
                  }
                })}
                {selectedDay && getSelectedDayItems().length === 0 && (
                  <p className="text-sm text-bb-dim">Nothing scheduled</p>
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
                      <h3 className="text-red-400 font-display font-semibold mb-3">
                        Overdue
                      </h3>
                      <div className="space-y-2">
                        {overdue.map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center justify-between p-2 rounded bg-bb-black/50"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full ${priorityDot[t.priority]}`}
                              />
                              <span className="text-sm">{t.title}</span>
                              {t.clientName && (
                                <Badge variant="default" size="sm">
                                  {t.clientName}
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-red-400">
                              {formatRelativeDate(new Date(t.dueDate))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {Object.entries(weeks).map(([weekLabel, weekItems]) => (
                    <div
                      key={weekLabel}
                      className="bg-bb-surface border border-bb-border rounded-lg p-4"
                    >
                      <h3 className="font-display font-semibold text-bb-muted mb-3">
                        Week of {weekLabel}
                      </h3>
                      <div className="space-y-2">
                        {weekItems.map((item) => {
                          if (item.type === "task") {
                            const t = item as CalendarTask;
                            return (
                              <div
                                key={t.id}
                                className="flex items-center justify-between p-2 rounded hover:bg-bb-elevated"
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`w-2 h-2 rounded-full ${priorityDot[t.priority]}`}
                                  />
                                  <span className="text-sm">{t.title}</span>
                                  {t.clientName && (
                                    <Badge variant="default" size="sm">
                                      {t.clientName}
                                    </Badge>
                                  )}
                                  <Badge variant="gray" size="sm">
                                    {t.status.replace("_", " ")}
                                  </Badge>
                                </div>
                                <span className="text-xs text-bb-dim">
                                  {format(new Date(t.dueDate), "EEE, MMM d")}
                                </span>
                              </div>
                            );
                          } else {
                            const b = item as CalBooking;
                            return (
                              <div
                                key={b.uid}
                                className="flex items-center justify-between p-2 rounded hover:bg-bb-elevated"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                  <Video size={12} className="text-emerald-400" />
                                  <span className="text-sm">{b.title}</span>
                                  {b.attendees && b.attendees.length > 0 && (
                                    <Badge variant="default" size="sm">
                                      {b.attendees[0]?.name}
                                    </Badge>
                                  )}
                                  {b.meetingUrl && (
                                    <a
                                      href={b.meetingUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-emerald-400 hover:text-emerald-300"
                                    >
                                      <ExternalLink size={12} />
                                    </a>
                                  )}
                                </div>
                                <span className="text-xs text-bb-dim">
                                  {format(parseISO(b.start), "EEE, MMM d · h:mm a")}
                                </span>
                              </div>
                            );
                          }
                        })}
                      </div>
                    </div>
                  ))}

                  {overdue.length === 0 && Object.keys(weeks).length === 0 && (
                    <div className="text-center py-12 text-bb-dim">
                      No upcoming deadlines or appointments in the next 90 days
                    </div>
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
