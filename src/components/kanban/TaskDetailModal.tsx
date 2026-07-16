"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Calendar, User, Trash2, Plus, Check, X, Send, Loader2, ArrowRight, Timer, Play, Square,
} from "lucide-react";
import Modal from "@/components/shared/Modal";
import Badge from "@/components/shared/Badge";
import { STATUS_COLUMNS, TASK_CATEGORIES, type TaskStatus, type Priority, type TaskCategory } from "@/types";

interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

interface ActivityEntry {
  id: string;
  actor: string;
  action: string;
  details: string | null;
  createdAt: string;
}

interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  category: TaskCategory;
  dueDate: string | null;
  assignedTo: string | null;
  tags: string[];
  client: { id: string; name: string } | null;
  checklistItems: ChecklistItem[];
  activityLogs: ActivityEntry[];
}

interface TaskDetailModalProps {
  taskId: string | null;
  onClose: () => void;
  onChanged: () => void;
  onDelete: (taskId: string) => void;
}

const PRIORITY_OPTIONS: { key: Priority; label: string; badge: "red" | "orange" | "blue" | "gray" }[] = [
  { key: "URGENT", label: "Urgent", badge: "red" },
  { key: "HIGH", label: "High", badge: "orange" },
  { key: "MEDIUM", label: "Medium", badge: "blue" },
  { key: "LOW", label: "Low", badge: "gray" },
];

function fmtMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Black or white text depending on how light the background color is. */
function contrastText(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const luma = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return luma > 150 ? "rgba(0,0,0,0.85)" : "#fff";
}

function formatTimestamp(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function TaskDetailModal({ taskId, onClose, onChanged, onDelete }: TaskDetailModalProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [update, setUpdate] = useState("");
  const [posting, setPosting] = useState(false);
  const [team, setTeam] = useState<Array<{ id: string; name: string; color?: string | null }>>([]);

  useEffect(() => {
    fetch("/api/users/assignable")
      .then((r) => r.json())
      .then((d) => { if (d.success) setTeam(d.data); })
      .catch(() => {});
  }, []);

  // ── Time tracking ──
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [customMins, setCustomMins] = useState("");
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const fetchTime = useCallback(async () => {
    if (!taskId) return;
    const res = await fetch(`/api/tasks/${taskId}/time`);
    const data = await res.json();
    if (data.success) setTotalMinutes(data.data.totalMinutes);
  }, [taskId]);

  useEffect(() => {
    if (!taskId) return;
    fetchTime();
    const saved = localStorage.getItem(`bb-timer-${taskId}`);
    setTimerStart(saved ? Number(saved) : null);
  }, [taskId, fetchTime]);

  useEffect(() => {
    if (!timerStart) return;
    const tick = () => setElapsed(Math.floor((Date.now() - timerStart) / 1000));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [timerStart]);

  async function logMinutes(mins: number) {
    if (!taskId || mins < 1) return;
    await fetch(`/api/tasks/${taskId}/time`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes: mins }),
    });
    fetchTime();
  }

  function startTimer() {
    if (!taskId) return;
    const now = Date.now();
    localStorage.setItem(`bb-timer-${taskId}`, String(now));
    setTimerStart(now);
  }

  async function stopTimer() {
    if (!taskId || !timerStart) return;
    const mins = Math.max(1, Math.round((Date.now() - timerStart) / 60000));
    localStorage.removeItem(`bb-timer-${taskId}`);
    setTimerStart(null);
    setElapsed(0);
    await logMinutes(mins);
  }

  const fetchTask = useCallback(async () => {
    if (!taskId) return;
    const res = await fetch(`/api/tasks/${taskId}`);
    const data = await res.json();
    if (data.success) setTask(data.data);
  }, [taskId]);

  useEffect(() => {
    setTask(null);
    if (taskId) {
      setLoading(true);
      fetchTask().finally(() => setLoading(false));
    }
  }, [taskId, fetchTask]);

  async function patchTask(patch: Record<string, unknown>) {
    if (!task) return;
    // Optimistic local update
    setTask({ ...task, ...patch } as TaskDetail);
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await fetchTask();
    onChanged();
  }

  async function toggleItem(item: ChecklistItem) {
    if (!task) return;
    setTask({
      ...task,
      checklistItems: task.checklistItems.map((i) =>
        i.id === item.id ? { ...i, checked: !i.checked } : i
      ),
    });
    await fetch(`/api/tasks/${task.id}/checklist/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked: !item.checked }),
    });
    onChanged();
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !newItem.trim()) return;
    setNewItem("");
    await fetch(`/api/tasks/${task.id}/checklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newItem.trim() }),
    });
    await fetchTask();
    onChanged();
  }

  async function removeItem(itemId: string) {
    if (!task) return;
    setTask({ ...task, checklistItems: task.checklistItems.filter((i) => i.id !== itemId) });
    await fetch(`/api/tasks/${task.id}/checklist/${itemId}`, { method: "DELETE" });
    onChanged();
  }

  async function postUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !update.trim() || posting) return;
    setPosting(true);
    try {
      await fetch(`/api/tasks/${task.id}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ details: update.trim() }),
      });
      setUpdate("");
      await fetchTask();
    } finally {
      setPosting(false);
    }
  }

  const done = task?.checklistItems.filter((i) => i.checked).length || 0;
  const total = task?.checklistItems.length || 0;

  return (
    <Modal open={!!taskId} onClose={onClose} title={task?.title || "Task"} className="max-w-xl">
      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-bb-dim" />
        </div>
      )}
      {task && (
        <div className="space-y-4">
          {/* Client + meta badges */}
          <div className="flex flex-wrap items-center gap-1.5">
            {task.client && <Badge variant="orange" size="sm">{task.client.name}</Badge>}
            <Badge variant="gray" size="sm">{task.category.replace(/_/g, " ")}</Badge>
            {task.tags.map((t) => <Badge key={t} variant="default" size="sm">{t}</Badge>)}
          </div>

          {task.description && (
            <p className="text-sm text-bb-muted whitespace-pre-wrap">{task.description}</p>
          )}

          {/* Status pills — Bronco style */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-bb-dim">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_COLUMNS.map((col) => (
                <button
                  key={col.key}
                  onClick={() => col.key !== task.status && patchTask({ status: col.key })}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    task.status === col.key
                      ? "bg-bb-orange text-white"
                      : "bg-bb-elevated text-bb-dim hover:bg-bb-border hover:text-white"
                  }`}
                >
                  {col.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority pills */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-bb-dim">Priority</p>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => p.key !== task.priority && patchTask({ priority: p.key })}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    task.priority === p.key
                      ? p.key === "URGENT" ? "bg-red-600 text-white"
                        : p.key === "HIGH" ? "bg-bb-orange text-white"
                        : p.key === "MEDIUM" ? "bg-blue-600 text-white"
                        : "bg-bb-border text-white"
                      : "bg-bb-elevated text-bb-dim hover:bg-bb-border hover:text-white"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Due date + assignee + category */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-bb-dim">Due date</p>
              <div className="flex items-center gap-1.5">
                <Calendar size={13} className="text-bb-dim shrink-0" />
                <input
                  type="date"
                  value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
                  onChange={(e) => patchTask({ dueDate: e.target.value || null })}
                  className="w-full px-2 py-1.5 bg-bb-black border border-bb-border rounded-md text-xs text-white focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
                />
              </div>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-bb-dim">Assigned</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => task.assignedTo && patchTask({ assignedTo: null })}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    !task.assignedTo
                      ? "bg-bb-orange text-white"
                      : "bg-bb-elevated text-bb-dim hover:bg-bb-border hover:text-white"
                  }`}
                >
                  Unassigned
                </button>
                {[
                  ...team.map((u) => ({ key: u.name, label: u.name, color: u.color || null })),
                  // Legacy assignee not in the team list (case-insensitive —
                  // old tasks stored lowercase names like "chase")
                  ...(task.assignedTo &&
                  task.assignedTo.toLowerCase() !== "agent" &&
                  !team.some((u) => u.name.toLowerCase() === task.assignedTo!.toLowerCase())
                    ? [{ key: task.assignedTo, label: task.assignedTo, color: null }]
                    : []),
                ].map((a) => {
                  const selected = task.assignedTo?.toLowerCase() === a.key.toLowerCase();
                  return (
                    <button
                      key={a.key}
                      onClick={() => a.key !== task.assignedTo && patchTask({ assignedTo: a.key })}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        selected
                          ? a.color
                            ? ""
                            : "bg-bb-orange text-white"
                          : "bg-bb-elevated text-bb-dim hover:bg-bb-border hover:text-white"
                      }`}
                      style={selected && a.color ? { backgroundColor: a.color, color: contrastText(a.color) } : undefined}
                    >
                      {a.color && !selected ? (
                        <span className="w-2 h-2 rounded-full ring-1 ring-white/20" style={{ backgroundColor: a.color }} />
                      ) : (
                        <User size={12} />
                      )}
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-bb-dim">Category</p>
              <select
                value={task.category}
                onChange={(e) => patchTask({ category: e.target.value as TaskCategory })}
                className="w-full px-2 py-1.5 bg-bb-black border border-bb-border rounded-md text-xs text-white focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
              >
                {TASK_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Checklist */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-bb-dim">
              Checklist {total > 0 && <span className="text-bb-muted normal-case">· {done}/{total}</span>}
            </p>
            <div className="space-y-1">
              {task.checklistItems.map((item) => (
                <div key={item.id} className="group flex items-center gap-2 rounded-lg bg-bb-black border border-bb-border px-2.5 py-1.5">
                  <button
                    onClick={() => toggleItem(item)}
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      item.checked ? "bg-bb-orange border-bb-orange" : "border-bb-dim hover:border-bb-orange"
                    }`}
                  >
                    {item.checked && <Check size={11} className="text-white" />}
                  </button>
                  <span className={`flex-1 text-xs ${item.checked ? "text-bb-dim line-through" : "text-white"}`}>
                    {item.label}
                  </span>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 text-bb-dim hover:text-red-400 transition-opacity"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <form onSubmit={addItem} className="flex items-center gap-2">
                <input
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  placeholder="Add checklist item..."
                  className="flex-1 px-2.5 py-1.5 bg-bb-black border border-bb-border rounded-lg text-xs text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
                />
                <button
                  type="submit"
                  disabled={!newItem.trim()}
                  className="p-1.5 rounded-lg bg-bb-elevated text-bb-dim hover:text-bb-orange disabled:opacity-40 transition-colors"
                >
                  <Plus size={14} />
                </button>
              </form>
            </div>
          </div>

          {/* Time tracking */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-bb-dim">
              Time logged {totalMinutes > 0 && <span className="text-bb-orange normal-case">· {fmtMinutes(totalMinutes)}</span>}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {timerStart ? (
                <button
                  onClick={stopTimer}
                  className="flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                >
                  <Square size={11} />
                  Stop · {fmtMinutes(Math.floor(elapsed / 60))} {String(elapsed % 60).padStart(2, "0")}s
                </button>
              ) : (
                <button
                  onClick={startTimer}
                  className="flex items-center gap-1.5 rounded-lg bg-bb-elevated hover:bg-bb-border px-3 py-1.5 text-xs font-semibold text-bb-muted hover:text-white transition-colors"
                >
                  <Play size={11} />
                  Start timer
                </button>
              )}
              {[15, 30, 60].map((m) => (
                <button
                  key={m}
                  onClick={() => logMinutes(m)}
                  className="rounded-lg bg-bb-elevated hover:bg-bb-border px-2.5 py-1.5 text-xs font-semibold text-bb-dim hover:text-white transition-colors"
                >
                  +{m === 60 ? "1h" : `${m}m`}
                </button>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const m = parseInt(customMins, 10);
                  if (m > 0) { logMinutes(m); setCustomMins(""); }
                }}
                className="flex items-center gap-1"
              >
                <Timer size={12} className="text-bb-dim" />
                <input
                  value={customMins}
                  onChange={(e) => setCustomMins(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="min"
                  inputMode="numeric"
                  className="w-14 px-2 py-1.5 bg-bb-black border border-bb-border rounded-lg text-xs text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
                />
                <button
                  type="submit"
                  disabled={!customMins}
                  className="rounded-lg bg-bb-elevated px-2 py-1.5 text-xs text-bb-dim hover:text-bb-orange disabled:opacity-40 transition-colors"
                >
                  <Plus size={12} />
                </button>
              </form>
            </div>
          </div>

          {/* Updates thread */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-bb-dim">Updates</p>
            <form onSubmit={postUpdate} className="flex items-center gap-2 mb-2">
              <input
                value={update}
                onChange={(e) => setUpdate(e.target.value)}
                placeholder={task.client ? `Log an update on ${task.client.name}...` : "Log an update..."}
                className="flex-1 px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-xs text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
              />
              <button
                type="submit"
                disabled={!update.trim() || posting}
                className="flex items-center gap-1 px-3 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-xs font-semibold rounded-lg disabled:opacity-40 transition-colors"
              >
                {posting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Post
              </button>
            </form>
            <div className="space-y-1.5 max-h-56 overflow-y-auto rounded-xl border border-bb-border bg-bb-black p-3">
              {task.activityLogs.length === 0 && (
                <p className="text-xs text-bb-dim">No updates yet — post one as you work.</p>
              )}
              {task.activityLogs.map((log) => (
                <div key={log.id} className="rounded-lg bg-bb-surface border border-bb-border px-3 py-2">
                  <div className="flex items-center gap-1.5 text-[10px] text-bb-dim">
                    <span className="font-semibold text-bb-muted capitalize">{log.actor}</span>
                    {log.action === "moved_task" && <ArrowRight size={10} className="text-bb-orange" />}
                    <span className="ml-auto">{formatTimestamp(log.createdAt)}</span>
                  </div>
                  {log.details && <p className="mt-0.5 text-xs text-white leading-snug">{log.details}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center pt-3 border-t border-bb-border">
            <button
              onClick={() => onDelete(task.id)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              <Trash2 size={13} /> Delete task
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs text-bb-muted hover:text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
