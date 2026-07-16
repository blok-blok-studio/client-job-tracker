"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Calendar, Bot, User, ClipboardList, Loader2 } from "lucide-react";
import TaskDetailModal from "@/components/kanban/TaskDetailModal";
import { STATUS_COLUMNS, type TaskStatus, type Priority } from "@/types";

interface ClientTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  assignedTo: string | null;
  checklistTotal: number;
  checklistDone: number;
  updatesCount: number;
}

const STATUS_STYLE: Record<TaskStatus, string> = {
  BACKLOG: "bg-bb-elevated text-bb-dim",
  TODO: "bg-blue-500/15 text-blue-400",
  IN_PROGRESS: "bg-bb-orange/15 text-bb-orange",
  IN_REVIEW: "bg-purple-500/15 text-purple-400",
  DONE: "bg-emerald-500/15 text-emerald-400",
  BLOCKED: "bg-red-500/15 text-red-400",
};

const PRIORITY_DOT: Record<Priority, string> = {
  URGENT: "bg-red-500",
  HIGH: "bg-bb-orange",
  MEDIUM: "bg-blue-500",
  LOW: "bg-bb-dim",
};

export default function ClientTasks({ clientId }: { clientId: string }) {
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?clientId=${clientId}`);
      const data = await res.json();
      if (data.success) {
        setTasks(
          data.data.map((t: Record<string, unknown>) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate,
            assignedTo: t.assignedTo,
            checklistTotal: (t._count as Record<string, number>)?.checklistItems || 0,
            checklistDone: ((t.checklistItems as Array<{ checked: boolean }>) || []).filter((i) => i.checked).length,
            updatesCount: (t._count as Record<string, number>)?.activityLogs || 0,
          }))
        );
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), clientId, status: "TODO" }),
      });
      const data = await res.json();
      if (data.success) {
        setNewTitle("");
        await fetchTasks();
        if (data.data?.id) setDetailTaskId(data.data.id);
      }
    } finally { setAdding(false); }
  }

  async function deleteTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    setDetailTaskId(null);
    fetchTasks();
  }

  const open = tasks.filter((t) => t.status !== "DONE");
  const done = tasks.filter((t) => t.status === "DONE");
  const visible = showDone ? [...open, ...done] : open;

  return (
    <div className="bg-bb-surface border border-bb-border rounded-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-bb-border">
        <div className="flex items-center gap-2">
          <ClipboardList size={15} className="text-bb-orange" />
          <h3 className="text-sm font-display font-semibold text-white">Tasks & Work Updates</h3>
          <span className="text-xs bg-bb-elevated px-1.5 py-0.5 rounded text-bb-dim">{open.length} open</span>
        </div>
        {done.length > 0 && (
          <button
            onClick={() => setShowDone(!showDone)}
            className="text-xs text-bb-dim hover:text-white transition-colors"
          >
            {showDone ? "Hide" : "Show"} done ({done.length})
          </button>
        )}
      </div>

      <div className="p-3 space-y-2">
        <form onSubmit={addTask} className="flex items-center gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add a task for this client..."
            className="flex-1 px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-sm text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
          />
          <button
            type="submit"
            disabled={!newTitle.trim() || adding}
            className="flex items-center gap-1.5 px-3 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors shrink-0"
          >
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            <span className="hidden sm:inline">Add</span>
          </button>
        </form>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={18} className="animate-spin text-bb-dim" />
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-bb-dim text-center py-4">
            No open tasks — add one above to start logging work updates.
          </p>
        ) : (
          visible.map((t) => (
            <button
              key={t.id}
              onClick={() => setDetailTaskId(t.id)}
              className="w-full flex items-center gap-2.5 rounded-lg border border-bb-border bg-bb-black px-3 py-2.5 text-left hover:border-bb-orange/40 transition-colors"
            >
              <span className={`h-2 w-2 rounded-full shrink-0 ${PRIORITY_DOT[t.priority]}`} />
              <span className={`flex-1 min-w-0 truncate text-sm ${t.status === "DONE" ? "text-bb-dim line-through" : "text-white"}`}>
                {t.title}
              </span>
              {t.checklistTotal > 0 && (
                <span className={`text-[10px] font-semibold shrink-0 ${t.checklistDone === t.checklistTotal ? "text-emerald-400" : "text-bb-muted"}`}>
                  {Math.round((t.checklistDone / t.checklistTotal) * 100)}%
                </span>
              )}
              {t.updatesCount > 0 && (
                <span className="text-[10px] text-bb-dim shrink-0">{t.updatesCount} update{t.updatesCount !== 1 ? "s" : ""}</span>
              )}
              {t.dueDate && (
                <span className="hidden sm:flex items-center gap-1 text-[10px] text-bb-dim shrink-0">
                  <Calendar size={10} />
                  {new Date(t.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              )}
              <span className="flex items-center gap-1 text-[10px] text-bb-dim shrink-0 max-w-[70px] truncate">
                {t.assignedTo === "agent" ? <Bot size={11} /> : <User size={11} />}
                <span className="hidden sm:inline truncate">{t.assignedTo === "agent" ? "AI" : t.assignedTo?.split(" ")[0]}</span>
              </span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${STATUS_STYLE[t.status]}`}>
                {STATUS_COLUMNS.find((c) => c.key === t.status)?.label || t.status}
              </span>
            </button>
          ))
        )}
      </div>

      <TaskDetailModal
        taskId={detailTaskId}
        onClose={() => setDetailTaskId(null)}
        onChanged={fetchTasks}
        onDelete={deleteTask}
      />
    </div>
  );
}
