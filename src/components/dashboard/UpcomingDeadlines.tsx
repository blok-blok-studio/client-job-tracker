"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { formatRelativeDate } from "@/lib/utils";
import Badge from "@/components/shared/Badge";
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
  async function handleToggleDone(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });
    if (onRefresh) onRefresh();
  }

  async function handleDeleteTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    if (onRefresh) onRefresh();
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
            return (
              <div key={task.id} className="px-5 py-3 flex items-center gap-3 hover:bg-bb-elevated/50 transition-colors">
                <button
                  onClick={() => handleToggleDone(task.id)}
                  className="w-4 h-4 rounded border border-bb-border hover:border-bb-orange shrink-0 transition-colors"
                  title="Mark done"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{task.title}</span>
                    {task.clientName && (
                      <Badge variant="default" size="sm">{task.clientName}</Badge>
                    )}
                  </div>
                  <span className={`text-xs ${isOverdue ? "text-red-400" : "text-bb-dim"}`}>
                    {relative}
                  </span>
                </div>
                <Badge variant={priorityVariant[task.priority]} size="sm">
                  {task.priority}
                </Badge>
                <button
                  onClick={() => handleDeleteTask(task.id)}
                  className="p-1 rounded hover:bg-red-500/20 text-bb-dim hover:text-red-400 transition-colors shrink-0"
                  title="Delete task"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
