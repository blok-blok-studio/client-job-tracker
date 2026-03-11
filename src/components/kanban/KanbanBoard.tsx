"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Search, Filter } from "lucide-react";
import KanbanColumn from "./KanbanColumn";
import Modal from "@/components/shared/Modal";
import Badge from "@/components/shared/Badge";
import { STATUS_COLUMNS, type TaskStatus, type Priority, type TaskCategory } from "@/types";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  category: TaskCategory;
  dueDate: string | null;
  assignedTo: string | null;
  sortOrder: number;
  clientName: string | null;
  clientId: string | null;
  checklistTotal: number;
  checklistDone: number;
  tags: string[];
}

export default function KanbanBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [search, setSearch] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [addModalStatus, setAddModalStatus] = useState<TaskStatus | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchTasks = useCallback(async () => {
    const res = await fetch("/api/tasks");
    const data = await res.json();
    if (data.success) {
      setTasks(
        data.data.map((t: Record<string, unknown>) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          category: t.category,
          dueDate: t.dueDate,
          assignedTo: t.assignedTo,
          sortOrder: t.sortOrder,
          clientName: (t.client as Record<string, string> | null)?.name || null,
          clientId: t.clientId,
          checklistTotal: (t._count as Record<string, number>)?.checklistItems || 0,
          checklistDone: 0,
          tags: t.tags || [],
        }))
      );
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetch("/api/clients?type=ACTIVE").then((r) => r.json()).then((d) => {
      if (d.success) setClients(d.data.map((c: Record<string, string>) => ({ id: c.id, name: c.name })));
    });
  }, [fetchTasks]);

  function getTasksForColumn(status: TaskStatus) {
    return tasks
      .filter((t) => t.status === status)
      .filter((t) => !search || t.title.toLowerCase().includes(search.toLowerCase()))
      .filter((t) => !filterClient || t.clientId === filterClient)
      .filter((t) => !filterPriority || t.priority === filterPriority)
      .filter((t) => !filterAssignee || t.assignedTo === filterAssignee)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task || null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeTaskItem = tasks.find((t) => t.id === activeId);
    if (!activeTaskItem) return;

    // Check if dropping over a column
    const isOverColumn = STATUS_COLUMNS.some((c) => c.key === overId);
    if (isOverColumn) {
      const newStatus = overId as TaskStatus;
      if (activeTaskItem.status !== newStatus) {
        setTasks((prev) =>
          prev.map((t) => (t.id === activeId ? { ...t, status: newStatus } : t))
        );
      }
      return;
    }

    // Dropping over another task
    const overTask = tasks.find((t) => t.id === overId);
    if (overTask && activeTaskItem.status !== overTask.status) {
      setTasks((prev) =>
        prev.map((t) => (t.id === activeId ? { ...t, status: overTask.status } : t))
      );
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active } = event;
    const activeId = active.id as string;
    const movedTask = tasks.find((t) => t.id === activeId);
    if (!movedTask) return;

    // Persist the change
    const columnTasks = tasks
      .filter((t) => t.status === movedTask.status)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const updates = columnTasks.map((t, i) => ({
      id: t.id,
      sortOrder: i,
      status: t.status,
    }));

    await fetch("/api/tasks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
  }

  async function handleAddTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      title: formData.get("title") as string,
      description: formData.get("description") as string,
      priority: formData.get("priority") as Priority,
      category: formData.get("category") as TaskCategory,
      clientId: (formData.get("clientId") as string) || null,
      assignedTo: formData.get("assignedTo") as string,
      dueDate: (formData.get("dueDate") as string) || null,
      status: addModalStatus,
    };

    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    setAddModalStatus(null);
    fetchTasks();
  }

  async function handleDeleteTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    setDetailTask(null);
    fetchTasks();
  }

  const inputClass = "w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50";

  return (
    <>
      {/* Filters */}
      <div className="space-y-3 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-dim" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-8 pr-3 py-1.5 bg-bb-surface border border-bb-border rounded-md text-sm text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-bb-dim shrink-0" />
          <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)} className="flex-1 min-w-[100px] px-3 py-1.5 bg-bb-surface border border-bb-border rounded-md text-sm text-bb-muted">
            <option value="">All Clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="flex-1 min-w-[100px] px-3 py-1.5 bg-bb-surface border border-bb-border rounded-md text-sm text-bb-muted">
            <option value="">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} className="flex-1 min-w-[100px] px-3 py-1.5 bg-bb-surface border border-bb-border rounded-md text-sm text-bb-muted">
            <option value="">All Assignees</option>
            <option value="agent">Agent</option>
            <option value="chase">Chase</option>
          </select>
        </div>
      </div>

      {/* Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUS_COLUMNS.map((col) => (
            <KanbanColumn
              key={col.key}
              status={col.key}
              label={col.label}
              tasks={getTasksForColumn(col.key)}
              onAddTask={(status) => setAddModalStatus(status)}
              onTaskClick={(id) => {
                const t = tasks.find((task) => task.id === id);
                if (t) setDetailTask(t);
              }}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask && (
            <div className="bg-bb-surface border border-bb-orange rounded-lg p-3 shadow-modal opacity-90 w-[280px]">
              <p className="text-sm font-medium">{activeTask.title}</p>
              <Badge variant="default" size="sm">{activeTask.priority}</Badge>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Add Task Modal */}
      <Modal open={!!addModalStatus} onClose={() => setAddModalStatus(null)} title={`Add Task — ${addModalStatus?.replace("_", " ")}`}>
        <form onSubmit={handleAddTask} className="space-y-4">
          <div>
            <label className="block text-sm text-bb-muted mb-1">Title *</label>
            <input name="title" required className={inputClass} placeholder="Task title" />
          </div>
          <div>
            <label className="block text-sm text-bb-muted mb-1">Description</label>
            <textarea name="description" rows={2} className={inputClass} placeholder="Details..." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-bb-muted mb-1">Priority</label>
              <select name="priority" defaultValue="MEDIUM" className={inputClass}>
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-bb-muted mb-1">Category</label>
              <select name="category" defaultValue="GENERAL" className={inputClass}>
                <option value="GENERAL">General</option>
                <option value="CONTENT_CREATION">Content Creation</option>
                <option value="SOCIAL_MEDIA">Social Media</option>
                <option value="CLIENT_COMMS">Client Comms</option>
                <option value="REPORTING">Reporting</option>
                <option value="STRATEGY">Strategy</option>
                <option value="INVOICING">Invoicing</option>
                <option value="DEVELOPMENT">Development</option>
                <option value="DESIGN">Design</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-bb-muted mb-1">Client</label>
              <select name="clientId" defaultValue="" className={inputClass}>
                <option value="">None</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-bb-muted mb-1">Assign To</label>
              <select name="assignedTo" defaultValue="agent" className={inputClass}>
                <option value="agent">Agent</option>
                <option value="chase">Chase</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-bb-muted mb-1">Due Date</label>
            <input name="dueDate" type="date" className={inputClass} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setAddModalStatus(null)} className="px-4 py-2 text-sm text-bb-muted hover:text-white">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md">Add Task</button>
          </div>
        </form>
      </Modal>

      {/* Task Detail Modal */}
      <Modal open={!!detailTask} onClose={() => setDetailTask(null)} title={detailTask?.title || "Task"} className="max-w-lg">
        {detailTask && (
          <div className="space-y-4">
            {detailTask.description && <p className="text-sm text-bb-muted">{detailTask.description}</p>}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-bb-dim">Status</span><p><Badge variant="default">{detailTask.status.replace("_", " ")}</Badge></p></div>
              <div><span className="text-bb-dim">Priority</span><p><Badge variant={detailTask.priority === "URGENT" ? "red" : detailTask.priority === "HIGH" ? "orange" : "blue"}>{detailTask.priority}</Badge></p></div>
              <div><span className="text-bb-dim">Category</span><p className="text-bb-muted">{detailTask.category.replace("_", " ")}</p></div>
              <div><span className="text-bb-dim">Assigned</span><p className="text-bb-muted">{detailTask.assignedTo || "Unassigned"}</p></div>
              {detailTask.clientName && <div><span className="text-bb-dim">Client</span><p className="text-bb-muted">{detailTask.clientName}</p></div>}
              {detailTask.dueDate && <div><span className="text-bb-dim">Due</span><p className="text-bb-muted">{new Date(detailTask.dueDate).toLocaleDateString()}</p></div>}
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-bb-border">
              <button onClick={() => handleDeleteTask(detailTask.id)} className="px-4 py-2 text-sm text-red-400 hover:text-red-300">Delete</button>
              <button onClick={() => setDetailTask(null)} className="px-4 py-2 text-sm text-bb-muted hover:text-white">Close</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
