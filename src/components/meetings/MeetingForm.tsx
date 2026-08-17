"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface MeetingFormValues {
  title: string;
  clientId: string | null;
  meetingDate: string;
  fathomUrl: string;
  notes: string;
  transcript: string;
  assigneeIds: string[];
}

export interface MeetingFormInitial extends Partial<MeetingFormValues> {
  id?: string;
}

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
}

interface TeamOption {
  id: string;
  name: string;
  color: string | null;
}

interface MeetingFormProps {
  clients: ClientOption[];
  team: TeamOption[];
  initial?: MeetingFormInitial;
  onSubmit: (values: MeetingFormValues) => Promise<void> | void;
  onCancel: () => void;
}

/** Local datetime string ("YYYY-MM-DDTHH:mm") for datetime-local inputs. */
function toLocalInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MeetingForm({ clients, team, initial, onSubmit, onCancel }: MeetingFormProps) {
  const [form, setForm] = useState({
    title: initial?.title || "",
    clientId: initial?.clientId || "",
    meetingDate: toLocalInput(initial?.meetingDate),
    fathomUrl: initial?.fathomUrl || "",
    notes: initial?.notes || "",
    transcript: initial?.transcript || "",
    assigneeIds: initial?.assigneeIds || [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleAssignee(id: string) {
    setForm((f) => ({
      ...f,
      assigneeIds: f.assigneeIds.includes(id)
        ? f.assigneeIds.filter((a) => a !== id)
        : [...f.assigneeIds, id],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError("Give the meeting a title"); return; }
    if (form.fathomUrl.trim() && !/^https?:\/\//i.test(form.fathomUrl.trim())) {
      setError("The recording link should start with https://");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        title: form.title.trim(),
        clientId: form.clientId || null,
        meetingDate: new Date(form.meetingDate).toISOString(),
        fathomUrl: form.fathomUrl.trim(),
        notes: form.notes,
        transcript: form.transcript,
        assigneeIds: form.assigneeIds,
      });
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50";
  const labelCls = "block text-xs font-medium text-bb-muted mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelCls}>Title</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Bronco — homepage revamp kickoff"
          className={inputCls}
          autoFocus
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Client (optional)</label>
          <select
            value={form.clientId}
            onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
            className={inputCls}
          >
            <option value="">No client — internal / prospect</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.company ? ` — ${c.company}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>When</label>
          <input
            type="datetime-local"
            value={form.meetingDate}
            onChange={(e) => setForm((f) => ({ ...f, meetingDate: e.target.value }))}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Fathom / recording link</label>
        <input
          type="url"
          value={form.fathomUrl}
          onChange={(e) => setForm((f) => ({ ...f, fathomUrl: e.target.value }))}
          placeholder="https://fathom.video/share/…"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Hand off to</label>
        <div className="flex gap-1.5 flex-wrap">
          {team.map((u) => {
            const on = form.assigneeIds.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleAssignee(u.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors",
                  on
                    ? "bg-bb-orange/15 border-bb-orange/40 text-bb-orange"
                    : "bg-bb-black border-bb-border text-bb-muted hover:text-white"
                )}
              >
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-semibold text-black/80"
                  style={{ backgroundColor: u.color || "#8a8a8a" }}
                >
                  {u.name.charAt(0).toUpperCase()}
                </span>
                {u.name}
              </button>
            );
          })}
          {team.length === 0 && <p className="text-xs text-bb-dim">No active team members</p>}
        </div>
        <p className="text-[11px] text-bb-dim mt-1">Assignees get a Slack ping + inbox notification the moment this is posted.</p>
      </div>

      <div>
        <label className={labelCls}>Handoff notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={5}
          placeholder={"What was decided, what needs to happen, deadlines, anything the team needs to start without asking…"}
          className={cn(inputCls, "resize-y")}
        />
      </div>

      <div>
        <label className={labelCls}>Transcript (paste from Fathom)</label>
        <textarea
          value={form.transcript}
          onChange={(e) => setForm((f) => ({ ...f, transcript: e.target.value }))}
          rows={5}
          placeholder="Paste the full transcript here so it's searchable and the team has every detail…"
          className={cn(inputCls, "resize-y font-mono text-xs")}
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-bb-muted hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
        >
          {saving ? "Saving…" : initial?.id ? "Save Changes" : "Post Handoff"}
        </button>
      </div>
    </form>
  );
}
