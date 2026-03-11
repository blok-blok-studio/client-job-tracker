"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2, Check, Loader2 } from "lucide-react";
import { formatRelativeDate } from "@/lib/utils";
import Badge from "@/components/shared/Badge";
import { useToast } from "@/components/shared/Toast";
import type { Priority } from "@/types";

interface Deadline {
  id: string;
  title: string;
  dueDate: string;
  priority: Priority;
  clientName: string | null;
  status: string;
}

const priorityVariant: Record<Priority, "red" | "orange" | "blue" | "gray"> = {
  URGENT: "red",
  HIGH: "orange",
  MEDIUM: "blue",
  LOW: "gray",
};

export default function UpcomingDeadlines({ deadlines, onRefresh }: { deadlines: Deadline[]; onRefresh?: () => void }) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  async function handleToggleDone(taskId: string) {
    setDoneIds((prev) => new Set(prev).add(taskId));
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DONE" }),
      });
      if (!res.ok) throw new Error("Failed");
      toast("Task marked as done", "success");
      await new Promise((r) => setTimeout(r, 1200));
      if (onRefresh) onRefresh();
    } catch {
      setDoneIds((prev) => { const next = new Set(prev); next.delete(taskId); return next; });
      toast("Failed to mark task as done", "error");
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    setDeletingIds((prev) => new Set(prev).add(taskId));
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast("Task deleted", "success");
      if (onRefresh) onRefresh();
    } catch {
      toast("Failed to delete task", "error");
    } finally {
      setDeletingIds((prev) => { const next = new Set(prev); next.delete(taskId); return next; });
    }
  }

  return (
    <div className="bg-bb-surface border border-bb-border rounded-lg">
      <div className="px-5 py-4 border-b border-bb-border flex items-center justify-between">
        <h2 className="font-display font-semibold">Upcoming Deadlines</h2>
        <Link href="/calendar" className="text-xs text-bb-orange hover:text-bb-orange-light">
          View All
        </Link>
      </div>
      <div className="divide-y divide-bb-border">
        {deadlines.length === 0 ? (
          <p className="px-5 py-8 text-center text-bb-dim text-sm">No upcoming deadlines</p>
        ) : (
          deadlines.map((task) => {
            const date = new Date(task.dueDate);
            const relative = formatRelativeDate(date);
            const isOverdue = date < new Date();
            const isDone = doneIds.has(task.id);
            const isDeleting = deletingIds.has(task.id);
            return (
              <div
                key={task.id}
                className={`px-5 py-3 flex items-center gap-3 hover:bg-bb-elevated/50 transition-all duration-500 ${isDone ? "opacity-40 bg-green-500/5" : ""} ${isDeleting ? "opacity-30" : ""}`}
              >
                <button
                  onClick={() => handleToggleDone(task.id)}
                  disabled={isDone || isDeleting}
                  className={`w-5 h-5 rounded border-2 shrink-0 transition-all duration-300 flex items-center justify-center ${isDone ? "bg-green-500 border-green-500 scale-110" : "border-bb-border hover:border-bb-orange"}`}
                  title="Mark done"
                >
                  {isDone && <Check size={12} className="text-white" strokeWidth={3} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium truncate transition-all duration-500 ${isDone ? "line-through text-bb-dim" : ""}`}>{task.title}</span>
                    {task.clientName && (
                      <Badge variant="default" size="sm">{task.clientName}</Badge>
                    )}
                  </div>
                  <span className={`text-xs ${isOverdue && !isDone ? "text-red-400" : "text-bb-dim"}`}>
                    {isDone ? "Completed" : relative}
                  </span>
                </div>
                <Badge variant={priorityVariant[task.priority]} size="sm">
                  {task.priority}
                </Badge>
                <button
                  onClick={() => handleDeleteTask(task.id)}
                  disabled={isDone || isDeleting}
                  className="p-1 rounded hover:bg-red-500/20 text-bb-dim hover:text-red-400 transition-colors shrink-0 disabled:opacity-30"
                  title="Delete task"
                >
                  {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
