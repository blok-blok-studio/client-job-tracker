"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { Search, Filter, LayoutGrid, CalendarDays } from "lucide-react";
import KanbanColumn from "./KanbanColumn";
import KanbanCalendar from "./KanbanCalendar";
import TaskDetailModal from "./TaskDetailModal";
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
  isRecurring?: boolean;
  blockedReason: string | null;
  blockedAt: string | null;
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
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [team, setTeam] = useState<Array<{ id: string; name: string; color?: string | null }>>([]);
  const [unpaid, setUnpaid] = useState<Map<string, number>>(new Map());
  const [view, setView] = useState<"board" | "calendar">("board");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Tracks the column the dragged card currently sits in, updated on every
  // dragOver. Refs don't suffer from stale closures, so dragEnd can trust it
  // even when it fires before React re-renders — state reads could not.
  const dragStatusRef = useRef<TaskStatus | null>(null);

  const fetchTasks = useCallback(async () => {
    const res = await fetch("/api/tasks");
    const data = await res.json();
    // A fetch that was already in flight when a drag started must not land
    // mid-drag — replacing the tasks array unmounts the card dnd-kit is
    // actively measuring and crashes the board.
    if (dragStatusRef.current !== null) return;
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
          isRecurring: !!t.isRecurring,
          blockedReason: (t.blockedReason as string) || null,
          blockedAt: (t.blockedAt as string) || null,
          sortOrder: t.sortOrder,
          clientName: (t.client as Record<string, string> | null)?.name || null,
          clientId: t.clientId,
          checklistTotal: (t._count as Record<string, number>)?.checklistItems || 0,
          checklistDone: ((t.checklistItems as Array<{ checked: boolean }>) || []).filter((i) => i.checked).length,
          tags: t.tags || [],
        }))
      );
    }
  }, []);

  // Keep the board multiplayer-fresh: refetch when the tab regains focus
  // and every 45s while visible, so two people never edit a stale snapshot
  useEffect(() => {
    const safeRefetch = () => {
      // Never refetch mid-drag — it would yank the card out of the user's hand
      if (dragStatusRef.current === null) fetchTasks();
    };
    const onFocus = () => safeRefetch();
    window.addEventListener("focus", onFocus);
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") safeRefetch();
    }, 45_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(iv);
    };
  }, [fetchTasks]);

  // Deep link: /kanban?task=<id> opens the task detail (used by ⌘K search)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("task");
    if (id) setDetailTaskId(id);
  }, []);

  useEffect(() => {
    fetchTasks();
    fetch("/api/clients?type=ACTIVE").then((r) => r.json()).then((d) => {
      if (d.success) setClients(d.data.map((c: Record<string, string>) => ({ id: c.id, name: c.name })));
    });
    fetch("/api/users/assignable").then((r) => r.json()).then((d) => {
      if (d.success) setTeam(d.data);
    }).catch(() => {});
    fetch("/api/clients/unpaid").then((r) => r.json()).then((d) => {
      if (d.success) {
        setUnpaid(new Map((d.data as Array<{ clientId: string; outstanding: number }>).map((u) => [u.clientId, u.outstanding])));
      }
    }).catch(() => {});
  }, [fetchTasks]);

  const visibleTasks = useMemo(() => {
    const q = search.toLowerCase();
    return tasks.filter(
      (t) =>
        (!q || t.title.toLowerCase().includes(q) || (t.clientName || "").toLowerCase().includes(q)) &&
        (!filterClient || t.clientId === filterClient) &&
        (!filterPriority || t.priority === filterPriority) &&
        (!filterAssignee || t.assignedTo === filterAssignee)
    );
  }, [tasks, search, filterClient, filterPriority, filterAssignee]);

  const teamColors = useMemo(
    () => new Map(team.map((u) => [u.name.toLowerCase(), u.color || null])),
    [team]
  );

  const tasksByColumn = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    for (const col of STATUS_COLUMNS) map.set(col.key, []);
    for (const t of visibleTasks) map.get(t.status)?.push(t);
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [visibleTasks]);

  async function handleReschedule(taskId: string, dueDate: string | null) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, dueDate } : t)));
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate }),
    });
    fetchTasks();
  }

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task || null);
    dragStatusRef.current = task?.status || null;
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
      dragStatusRef.current = newStatus;
      if (activeTaskItem.status !== newStatus) {
        setTasks((prev) =>
          prev.map((t) => (t.id === activeId ? { ...t, status: newStatus } : t))
        );
      }
      return;
    }

    // Dropping over another task
    const overTask = tasks.find((t) => t.id === overId);
    if (overTask && overId !== activeId) {
      dragStatusRef.current = overTask.status;
      if (activeTaskItem.status !== overTask.status) {
        setTasks((prev) =>
          prev.map((t) => (t.id === activeId ? { ...t, status: overTask.status } : t))
        );
      }
    }
  }

  function handleDragCancel() {
    setActiveTask(null);
    dragStatusRef.current = null;
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    const activeId = active.id as string;
    const movedTask = tasks.find((t) => t.id === activeId);
    if (!movedTask) {
      dragStatusRef.current = null;
      return;
    }

    // Resolve the destination status. Priority: the column dropped on, then a
    // DIFFERENT task dropped on (other tasks' statuses are stable during a
    // drag), then the ref tracked through dragOver. Never trust the dragged
    // task's own entry in `tasks` — dnd-kit often reports the drop target as
    // the dragged card itself, and the state closure can be a render behind,
    // which silently persisted the OLD column (no move saved, no Slack ping).
    const overId = over ? (over.id as string) : null;
    const overColumn = overId && STATUS_COLUMNS.some((c) => c.key === overId)
      ? (overId as TaskStatus)
      : null;
    const overOtherTaskStatus =
      overId && overId !== activeId ? tasks.find((t) => t.id === overId)?.status : undefined;
    const newStatus: TaskStatus =
      overColumn ?? overOtherTaskStatus ?? dragStatusRef.current ?? movedTask.status;
    dragStatusRef.current = null;

    const next = tasks.map((t) => (t.id === activeId ? { ...t, status: newStatus } : t));
    setTasks(next);

    const columnTasks = next
      .filter((t) => t.status === newStatus)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const updates = columnTasks.map((t, i) => ({
      id: t.id,
      sortOrder: i,
      status: newStatus,
    }));

    try {
      const res = await fetch("/api/tasks/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Server rejected the move — resync so the board reflects reality
      fetchTasks();
    }
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
      assignedTo: (formData.get("assignedTo") as string) || null,
      dueDate: (formData.get("dueDate") as string) || null,
      status: addModalStatus,
      isRecurring: !!(formData.get("recurPattern") as string),
      recurPattern: (formData.get("recurPattern") as string) || null,
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
    setDetailTaskId(null);
    fetchTasks();
  }

  const inputClass = "w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50";

  return (
    <>
      {/* Filters */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-dim" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="w-full pl-8 pr-3 py-1.5 bg-bb-surface border border-bb-border rounded-md text-sm text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
            />
          </div>
          <div className="flex rounded-md border border-bb-border overflow-hidden shrink-0">
            {([
              { key: "board", label: "Board", Icon: LayoutGrid },
              { key: "calendar", label: "Calendar", Icon: CalendarDays },
            ] as const).map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
                  view === key
                    ? "bg-bb-orange text-white"
                    : "bg-bb-surface text-bb-dim hover:text-white"
                }`}
              >
                <Icon size={13} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
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
            {team.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
          </select>
        </div>
      </div>

      {/* Board */}
      {view === "board" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STATUS_COLUMNS.map((col) => (
              <KanbanColumn
                key={col.key}
                status={col.key}
                label={col.label}
                tasks={(tasksByColumn.get(col.key) || []).map((t) => ({
                  ...t,
                  assigneeColor: t.assignedTo ? teamColors.get(t.assignedTo.toLowerCase()) ?? null : null,
                  clientUnpaid: t.clientId ? unpaid.get(t.clientId) ?? null : null,
                  // Reason lingers on the row for context if re-blocked, but only renders in the Blocked column
                  blockedReason: t.status === "BLOCKED" ? t.blockedReason : null,
                  blockedDays:
                    t.status === "BLOCKED" && t.blockedAt
                      ? Math.floor((Date.now() - new Date(t.blockedAt).getTime()) / 86_400_000)
                      : null,
                }))}
                onAddTask={(status) => setAddModalStatus(status)}
                onTaskClick={(id) => setDetailTaskId(id)}
                onDeleteTask={handleDeleteTask}
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
      ) : (
        <KanbanCalendar
          tasks={visibleTasks}
          onTaskClick={(id) => setDetailTaskId(id)}
          onReschedule={handleReschedule}
        />
      )}

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
              <select name="assignedTo" defaultValue="" className={inputClass}>
                <option value="">Unassigned</option>
                {team.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-bb-muted mb-1">Due Date</label>
              <input name="dueDate" type="date" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-bb-muted mb-1">Repeats</label>
              <select name="recurPattern" defaultValue="" className={inputClass}>
                <option value="">Never</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setAddModalStatus(null)} className="px-4 py-2 text-sm text-bb-muted hover:text-white">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md">Add Task</button>
          </div>
        </form>
      </Modal>

      {/* Task Detail Modal */}
      <TaskDetailModal
        taskId={detailTaskId}
        onClose={() => setDetailTaskId(null)}
        onChanged={fetchTasks}
        onDelete={handleDeleteTask}
      />
    </>
  );
}
