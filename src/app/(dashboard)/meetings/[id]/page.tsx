"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Video, Pencil, Trash2, Plus, Send, Copy, Check,
  ChevronDown, ChevronUp, ClipboardList, MessageSquare, ExternalLink,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import Modal from "@/components/shared/Modal";
import Badge from "@/components/shared/Badge";
import MeetingForm, { type MeetingFormValues } from "@/components/meetings/MeetingForm";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/shared/Toast";
import { readJson, friendlyError } from "@/lib/fetch-json";

interface MeetingDetail {
  id: string;
  title: string;
  meetingDate: string;
  fathomUrl: string | null;
  transcript: string | null;
  notes: string | null;
  status: string;
  assigneeIds: string[];
  createdByName: string;
  clientId: string | null;
  client: { id: string; name: string; company: string | null } | null;
  tasks: Array<{ id: string; title: string; status: string; assignedTo: string | null; dueDate: string | null }>;
  comments: Array<{ id: string; authorName: string; body: string; createdAt: string }>;
}

interface ClientOption { id: string; name: string; company: string | null }
interface TeamOption { id: string; name: string; color: string | null }

const statusVariant: Record<string, "orange" | "blue" | "green" | "gray"> = {
  NEW: "orange",
  IN_PROGRESS: "blue",
  DONE: "green",
};

const statusLabel: Record<string, string> = {
  NEW: "Needs pickup",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

const taskStatusVariant: Record<string, "gray" | "blue" | "yellow" | "green" | "red"> = {
  BACKLOG: "gray",
  TODO: "blue",
  IN_PROGRESS: "yellow",
  IN_REVIEW: "yellow",
  DONE: "green",
  BLOCKED: "red",
};

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [team, setTeam] = useState<TeamOption[]>([]);
  const [editing, setEditing] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Quick task form
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);

  // Comment composer
  const [comment, setComment] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  const fetchMeeting = useCallback(async () => {
    try {
      const res = await fetch(`/api/meetings/${id}`);
      const data = await res.json();
      if (data.success) setMeeting(data.data);
      else router.replace("/meetings");
    } catch {
      // keep whatever we have
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchMeeting();
    fetch("/api/clients?type=ALL")
      .then((r) => r.json())
      .then((d) => d.success && setClients(d.data.map((c: ClientOption & Record<string, unknown>) => ({ id: c.id, name: c.name, company: c.company }))))
      .catch(() => {});
    fetch("/api/users/assignable")
      .then((r) => r.json())
      .then((d) => d.success && setTeam(d.data))
      .catch(() => {});
  }, [fetchMeeting]);

  const teamById = useMemo(() => new Map(team.map((u) => [u.id, u])), [team]);
  const assignees = useMemo(
    () => (meeting?.assigneeIds || []).map((uid) => teamById.get(uid)).filter(Boolean) as TeamOption[],
    [meeting?.assigneeIds, teamById]
  );

  async function patchMeeting(body: Record<string, unknown>, successMsg?: string) {
    const res = await fetch(`/api/meetings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await readJson(res, "Failed to update meeting. Please try again.");
    if (result.ok) {
      if (successMsg) toast(successMsg, "success");
      fetchMeeting();
      return true;
    }
    toast(result.error!, "error");
    return false;
  }

  async function handleEdit(values: MeetingFormValues) {
    const ok = await patchMeeting({ ...values }, "Meeting updated");
    if (ok) setEditing(false);
  }

  async function handleDelete() {
    if (!meeting) return;
    if (!window.confirm(`Delete "${meeting.title}"? Tasks created from it stay on the board.`)) return;
    const res = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
    const result = await readJson(res, "Failed to delete meeting. Please try again.");
    if (result.ok) {
      toast("Meeting deleted", "success");
      router.push("/meetings");
    } else {
      toast(result.error!, "error");
    }
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setTaskSaving(true);
    try {
      const res = await fetch(`/api/meetings/${id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskTitle.trim(),
          assignedTo: taskAssignee || null,
          dueDate: taskDue || null,
        }),
      });
      const result = await readJson(res, "Failed to add task. Please try again.");
      if (result.ok) {
        setTaskTitle("");
        setTaskAssignee("");
        setTaskDue("");
        setShowTaskForm(false);
        toast("Task added to the board", "success");
        fetchMeeting();
      } else {
        toast(result.error!, "error");
      }
    } catch (err) {
      toast(friendlyError(err, "Failed to add task. Please try again."), "error");
    } finally {
      setTaskSaving(false);
    }
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setCommentSaving(true);
    try {
      const res = await fetch(`/api/meetings/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: comment.trim() }),
      });
      const result = await readJson(res, "Failed to add comment. Please try again.");
      if (result.ok) {
        setComment("");
        fetchMeeting();
      } else {
        toast(result.error!, "error");
      }
    } catch (err) {
      toast(friendlyError(err, "Failed to add comment. Please try again."), "error");
    } finally {
      setCommentSaving(false);
    }
  }

  function copyTranscript() {
    if (!meeting?.transcript) return;
    navigator.clipboard.writeText(meeting.transcript).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const inputCls =
    "w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50";

  if (loading || !meeting) {
    return (
      <div>
        <TopBar title="Meeting" />
        <div className="px-4 lg:px-6 text-center py-12 text-bb-dim">
          {loading ? "Loading meeting…" : "Meeting not found."}
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Meeting" subtitle={meeting.client?.name || undefined} />
      <div className="px-4 lg:px-6 space-y-4 pb-8">
        <Link href="/meetings" className="inline-flex items-center gap-1.5 text-xs text-bb-dim hover:text-white transition-colors">
          <ArrowLeft size={14} /> All meetings
        </Link>

        {/* Header card */}
        <div className="bg-bb-surface border border-bb-border rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-2 flex-wrap">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold text-white">{meeting.title}</h1>
              <p className="text-xs text-bb-dim mt-0.5">
                {new Date(meeting.meetingDate).toLocaleString("en-US", {
                  weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
                })}
                {meeting.client && (
                  <>
                    {" · "}
                    <Link href={`/clients/${meeting.client.id}`} className="text-bb-muted hover:text-bb-orange transition-colors">
                      {meeting.client.name}
                    </Link>
                  </>
                )}
                {" · posted by "}{meeting.createdByName}
              </p>
            </div>
            <Badge variant={statusVariant[meeting.status] || "gray"}>{statusLabel[meeting.status] || meeting.status}</Badge>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {meeting.fathomUrl && (
              <a
                href={meeting.fathomUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-orange hover:bg-bb-orange-light text-white text-xs font-medium rounded-md transition-colors"
              >
                <Video size={14} /> Watch recording <ExternalLink size={11} />
              </a>
            )}
            {meeting.status !== "DONE" ? (
              <button
                onClick={() => patchMeeting({ status: "DONE" }, "Marked done")}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-elevated hover:bg-bb-border text-bb-muted hover:text-white text-xs rounded-md transition-colors"
              >
                <Check size={14} /> Mark done
              </button>
            ) : (
              <button
                onClick={() => patchMeeting({ status: "IN_PROGRESS" }, "Reopened")}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-elevated hover:bg-bb-border text-bb-muted hover:text-white text-xs rounded-md transition-colors"
              >
                Reopen
              </button>
            )}
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-elevated hover:bg-bb-border text-bb-muted hover:text-white text-xs rounded-md transition-colors"
            >
              <Pencil size={13} /> Edit
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-bb-dim hover:text-red-400 text-xs rounded-md transition-colors ml-auto"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>

          {/* Assignees */}
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-bb-border">
            <span className="text-xs text-bb-dim">Handed to:</span>
            {assignees.length === 0 && <span className="text-xs text-bb-dim italic">nobody yet — edit to assign</span>}
            {assignees.map((a) => (
              <span key={a.id} className="flex items-center gap-1.5 px-2 py-0.5 bg-bb-black border border-bb-border rounded-full text-xs text-white">
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-semibold text-black/80"
                  style={{ backgroundColor: a.color || "#8a8a8a" }}
                >
                  {a.name.charAt(0).toUpperCase()}
                </span>
                {a.name}
              </span>
            ))}
          </div>
        </div>

        {/* Handoff notes */}
        <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-white mb-2">Handoff notes</h2>
          {meeting.notes ? (
            <p className="text-sm text-bb-muted whitespace-pre-wrap">{meeting.notes}</p>
          ) : (
            <p className="text-sm text-bb-dim italic">No notes yet — edit the meeting to add the handoff.</p>
          )}
        </div>

        {/* Transcript */}
        <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white">Transcript</h2>
            {meeting.transcript && (
              <>
                <button
                  onClick={copyTranscript}
                  className="flex items-center gap-1 text-xs text-bb-dim hover:text-white transition-colors ml-auto"
                >
                  {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={() => setTranscriptOpen((o) => !o)}
                  className="flex items-center gap-1 text-xs text-bb-dim hover:text-white transition-colors"
                >
                  {transcriptOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {transcriptOpen ? "Collapse" : "Expand"}
                </button>
              </>
            )}
          </div>
          {meeting.transcript ? (
            <pre
              className={cn(
                "mt-2 text-xs text-bb-muted whitespace-pre-wrap font-mono bg-bb-black border border-bb-border rounded-md p-3 overflow-y-auto",
                transcriptOpen ? "max-h-[70vh]" : "max-h-40"
              )}
            >
              {meeting.transcript}
            </pre>
          ) : (
            <p className="text-sm text-bb-dim italic mt-2">
              No transcript pasted{meeting.fathomUrl ? " — it's in the Fathom recording above" : ""}.
            </p>
          )}
        </div>

        {/* Tasks from this meeting */}
        <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList size={15} className="text-bb-orange" />
            <h2 className="text-sm font-semibold text-white">Tasks from this meeting</h2>
            <button
              onClick={() => setShowTaskForm((s) => !s)}
              className="flex items-center gap-1 text-xs text-bb-orange hover:text-bb-orange-light transition-colors ml-auto"
            >
              <Plus size={13} /> Add task
            </button>
          </div>

          {showTaskForm && (
            <form onSubmit={handleAddTask} className="space-y-2 mb-3 p-3 bg-bb-black border border-bb-border rounded-md">
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="What needs doing…"
                className={inputCls}
                autoFocus
              />
              <div className="grid grid-cols-2 gap-2">
                <select value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)} className={inputCls}>
                  <option value="">Unassigned</option>
                  {team.map((u) => (
                    <option key={u.id} value={u.name}>{u.name}</option>
                  ))}
                </select>
                <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className={inputCls} />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowTaskForm(false)} className="px-3 py-1.5 text-xs text-bb-muted hover:text-white transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={taskSaving || !taskTitle.trim()}
                  className="px-3 py-1.5 bg-bb-orange hover:bg-bb-orange-light disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors"
                >
                  {taskSaving ? "Adding…" : "Add to board"}
                </button>
              </div>
            </form>
          )}

          {meeting.tasks.length === 0 ? (
            <p className="text-sm text-bb-dim italic">
              Nothing on the board yet. Add tasks straight from the notes so the work is claimable.
            </p>
          ) : (
            <div className="space-y-1.5">
              {meeting.tasks.map((t) => (
                <Link
                  key={t.id}
                  href={`/kanban?task=${t.id}`}
                  className="flex items-center gap-2 px-3 py-2 bg-bb-black border border-bb-border hover:border-bb-orange/50 rounded-md transition-colors"
                >
                  <span className="text-sm text-white flex-1 min-w-0 truncate">{t.title}</span>
                  {t.assignedTo && <span className="text-xs text-bb-dim shrink-0">{t.assignedTo}</span>}
                  {t.dueDate && (
                    <span className="text-xs text-bb-dim shrink-0">
                      {new Date(t.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                  <Badge variant={taskStatusVariant[t.status] || "gray"}>{t.status.replace(/_/g, " ")}</Badge>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Comments */}
        <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={15} className="text-bb-orange" />
            <h2 className="text-sm font-semibold text-white">Thread</h2>
            <span className="text-xs text-bb-dim">@-mention a teammate to ping them</span>
          </div>

          {meeting.comments.length > 0 && (
            <div className="space-y-3 mb-3">
              {meeting.comments.map((c) => (
                <div key={c.id} className="flex gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-bb-elevated flex items-center justify-center text-[10px] font-semibold text-white shrink-0">
                    {c.authorName.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-bb-dim">
                      <span className="text-white font-medium">{c.authorName}</span>
                      {" · "}
                      {new Date(c.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </p>
                    <p className="text-sm text-bb-muted whitespace-pre-wrap mt-0.5">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleComment} className="flex gap-2">
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Question or update for the thread…"
              className={inputCls}
            />
            <button
              type="submit"
              disabled={commentSaving || !comment.trim()}
              className="px-3 py-2 bg-bb-orange hover:bg-bb-orange-light disabled:opacity-50 text-white rounded-md transition-colors shrink-0"
              aria-label="Send comment"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      </div>

      {/* Edit modal */}
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit Meeting">
        {editing && (
          <MeetingForm
            clients={clients}
            team={team}
            initial={{
              id: meeting.id,
              title: meeting.title,
              clientId: meeting.clientId,
              meetingDate: meeting.meetingDate,
              fathomUrl: meeting.fathomUrl || "",
              notes: meeting.notes || "",
              transcript: meeting.transcript || "",
              assigneeIds: meeting.assigneeIds,
            }}
            onSubmit={handleEdit}
            onCancel={() => setEditing(false)}
          />
        )}
      </Modal>
    </div>
  );
}
