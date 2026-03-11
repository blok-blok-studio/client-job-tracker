"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bot, User, Calendar } from "lucide-react";
import Badge from "@/components/shared/Badge";
import { formatRelativeDate } from "@/lib/utils";
import type { Priority, TaskCategory } from "@/types";

interface TaskCardProps {
  id: string;
  title: string;
  clientName: string | null;
  priority: Priority;
  category: TaskCategory;
  dueDate: string | null;
  assignedTo: string | null;
  checklistTotal: number;
  checklistDone: number;
  onClick: () => void;
}

const priorityBorder: Record<Priority, string> = {
  URGENT: "border-l-red-500",
  HIGH: "border-l-bb-orange",
  MEDIUM: "border-l-blue-500",
  LOW: "border-l-bb-dim",
};

const categoryLabel: Record<string, string> = {
  GENERAL: "General",
  CONTENT_CREATION: "Content",
  SOCIAL_MEDIA: "Social",
  CLIENT_COMMS: "Comms",
  REPORTING: "Report",
  STRATEGY: "Strategy",
  INVOICING: "Invoice",
  ONBOARDING: "Onboard",
  OFFBOARDING: "Offboard",
  DEVELOPMENT: "Dev",
  DESIGN: "Design",
};

export default function TaskCard({
  id,
  title,
  clientName,
  priority,
  category,
  dueDate,
  assignedTo,
  checklistTotal,
  checklistDone,
  onClick,
}: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isOverdue = dueDate && new Date(dueDate) < new Date();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`bg-bb-surface border border-bb-border border-l-4 ${priorityBorder[priority]} rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-bb-orange/30 transition-colors`}
    >
      <p className="text-sm font-medium mb-2 line-clamp-2">{title}</p>

      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {clientName && <Badge variant="default" size="sm">{clientName}</Badge>}
        <Badge variant="gray" size="sm">{categoryLabel[category] || category}</Badge>
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {dueDate && (
            <span className={`flex items-center gap-1 ${isOverdue ? "text-red-400" : "text-bb-dim"}`}>
              <Calendar size={10} />
              {formatRelativeDate(new Date(dueDate))}
            </span>
          )}
          {checklistTotal > 0 && (
            <span className="text-bb-dim">
              {checklistDone}/{checklistTotal}
            </span>
          )}
        </div>
        <span className="text-bb-dim">
          {assignedTo === "agent" ? <Bot size={14} /> : <User size={14} />}
        </span>
      </div>
    </div>
  );
}
