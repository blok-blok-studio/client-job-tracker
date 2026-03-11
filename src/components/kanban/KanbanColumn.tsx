"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import TaskCard from "./TaskCard";
import type { TaskStatus, Priority, TaskCategory } from "@/types";

interface Task {
  id: string;
  title: string;
  clientName: string | null;
  priority: Priority;
  category: TaskCategory;
  dueDate: string | null;
  assignedTo: string | null;
  checklistTotal: number;
  checklistDone: number;
}

interface KanbanColumnProps {
  status: TaskStatus;
  label: string;
  tasks: Task[];
  onAddTask: (status: TaskStatus) => void;
  onTaskClick: (taskId: string) => void;
}

export default function KanbanColumn({ status, label, tasks, onAddTask, onTaskClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col bg-bb-black rounded-lg border ${isOver ? "border-bb-orange" : "border-bb-border"} min-w-[280px] max-w-[320px] flex-shrink-0 transition-colors`}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-bb-border">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-display font-semibold text-bb-muted">{label}</h3>
          <span className="text-xs bg-bb-elevated px-1.5 py-0.5 rounded text-bb-dim">{tasks.length}</span>
        </div>
        <button
          onClick={() => onAddTask(status)}
          className="p-1 rounded hover:bg-bb-elevated text-bb-dim hover:text-bb-orange transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-250px)]">
          {tasks.map((task) => (
            <TaskCard key={task.id} {...task} onClick={() => onTaskClick(task.id)} />
          ))}
          {tasks.length === 0 && (
            <div className="text-center py-8 text-bb-dim text-xs">
              Drop tasks here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
