"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarX } from "lucide-react";
import type { TaskStatus, Priority } from "@/types";

interface CalTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  clientName: string | null;
}

interface KanbanCalendarProps {
  tasks: CalTask[];
  onTaskClick: (taskId: string) => void;
  onReschedule: (taskId: string, dueDate: string | null) => void;
}

const PRIORITY_BORDER: Record<Priority, string> = {
  URGENT: "border-l-red-500",
  HIGH: "border-l-bb-orange",
  MEDIUM: "border-l-blue-500",
  LOW: "border-l-bb-dim",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function TaskChip({ task, onTaskClick }: { task: CalTask; onTaskClick: (id: string) => void }) {
  const isDone = task.status === "DONE";
  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onTaskClick(task.id);
      }}
      title={task.clientName ? `${task.title} — ${task.clientName}` : task.title}
      className={`block w-full cursor-pointer rounded border-l-2 ${PRIORITY_BORDER[task.priority]} bg-bb-surface hover:bg-bb-elevated px-1.5 py-1 text-left transition-colors ${
        isDone ? "opacity-50" : ""
      }`}
    >
      <p className={`truncate text-[11px] leading-tight text-white ${isDone ? "line-through" : ""}`}>
        {task.title}
      </p>
      {task.clientName && (
        <p className="truncate text-[9px] text-bb-dim">{task.clientName}</p>
      )}
    </button>
  );
}

export default function KanbanCalendar({ tasks, onTaskClick, onReschedule }: KanbanCalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, CalTask[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const key = dateKey(new Date(t.dueDate));
      const list = map.get(key) || [];
      list.push(t);
      map.set(key, list);
    }
    return map;
  }, [tasks]);

  const unscheduled = useMemo(
    () => tasks.filter((t) => !t.dueDate && t.status !== "DONE"),
    [tasks]
  );

  const weeks = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const out: Date[][] = [];
    const cursor = new Date(start);
    do {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      out.push(week);
    } while (cursor.getMonth() === viewMonth && cursor.getFullYear() === viewYear);
    return out;
  }, [viewYear, viewMonth]);

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function handleDrop(e: React.DragEvent, key: string | null) {
    e.preventDefault();
    setDragOverKey(null);
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) onReschedule(taskId, key);
  }

  const todayKey = dateKey(today);
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-3">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold text-white">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => shiftMonth(-1)}
            className="p-1.5 rounded-md bg-bb-surface border border-bb-border text-bb-dim hover:text-white transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => {
              setViewYear(today.getFullYear());
              setViewMonth(today.getMonth());
            }}
            className="px-2.5 py-1.5 rounded-md bg-bb-surface border border-bb-border text-xs text-bb-muted hover:text-white transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => shiftMonth(1)}
            className="p-1.5 rounded-md bg-bb-surface border border-bb-border text-bb-dim hover:text-white transition-colors"
            aria-label="Next month"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Unscheduled tray — drop here to clear the due date */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverKey("__unscheduled__");
        }}
        onDragLeave={() => setDragOverKey(null)}
        onDrop={(e) => handleDrop(e, null)}
        className={`rounded-lg border ${
          dragOverKey === "__unscheduled__" ? "border-bb-orange" : "border-bb-border"
        } bg-bb-black p-2 transition-colors`}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <CalendarX size={12} className="text-bb-dim" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-bb-dim">
            No due date · {unscheduled.length}
          </span>
          <span className="text-[10px] text-bb-dim ml-auto hidden sm:inline">
            drag tasks onto a day to schedule them
          </span>
        </div>
        {unscheduled.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
            {unscheduled.map((t) => (
              <TaskChip key={t.id} task={t} onTaskClick={onTaskClick} />
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-bb-dim">Everything open has a due date 🎯</p>
        )}
      </div>

      {/* Month grid */}
      <div className="rounded-lg border border-bb-border overflow-hidden">
        <div className="grid grid-cols-7 bg-bb-black border-b border-bb-border">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-bb-dim">
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d[0]}</span>
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-bb-border last:border-b-0">
            {week.map((day) => {
              const key = dateKey(day);
              const inMonth = day.getMonth() === viewMonth;
              const isToday = key === todayKey;
              const dayTasks = tasksByDay.get(key) || [];
              return (
                <div
                  key={key}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverKey(key);
                  }}
                  onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                  onDrop={(e) => handleDrop(e, key)}
                  className={`min-h-[64px] sm:min-h-[92px] border-r border-bb-border last:border-r-0 p-0.5 sm:p-1 space-y-1 transition-colors ${
                    inMonth ? "bg-bb-black" : "bg-bb-surface/40"
                  } ${dragOverKey === key ? "bg-bb-orange/10 ring-1 ring-inset ring-bb-orange" : ""}`}
                >
                  <div className="flex justify-end">
                    <span
                      className={`text-[10px] leading-none px-1 py-0.5 rounded ${
                        isToday
                          ? "bg-bb-orange text-white font-bold"
                          : inMonth
                          ? "text-bb-muted"
                          : "text-bb-dim"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                  </div>
                  {dayTasks.map((t) => (
                    <TaskChip key={t.id} task={t} onTaskClick={onTaskClick} />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
