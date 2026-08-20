"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Video, Inbox, Hammer, CheckCircle2, ClipboardList, MessageSquare } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import Modal from "@/components/shared/Modal";
import Badge from "@/components/shared/Badge";
import MeetingForm, { type MeetingFormValues } from "@/components/meetings/MeetingForm";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/shared/Toast";
import { readJson } from "@/lib/fetch-json";

interface MeetingRow {
  id: string;
  title: string;
  meetingDate: string;
  fathomUrl: string | null;
  notes: string | null;
  status: string;
  assigneeIds: string[];
  createdByName: string;
  client: { id: string; name: string; company: string | null } | null;
  _count: { tasks: number; comments: number };
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

const STATUS_TABS = [
  { key: "OPEN", label: "Open" },
  { key: "NEW", label: "Needs pickup" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "DONE", label: "Done" },
  { key: "ALL", label: "All" },
];

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

export default function MeetingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [team, setTeam] = useState<TeamOption[]>([]);
  const [statusTab, setStatusTab] = useState("OPEN");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const { toast } = useToast();

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch("/api/meetings");
      const data = await res.json();
      if (data.success) setMeetings(data.data);
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
    fetch("/api/clients?type=ALL")
      .then((r) => r.json())
      .then((d) => d.success && setClients(d.data.map((c: ClientOption & Record<string, unknown>) => ({ id: c.id, name: c.name, company: c.company }))))
      .catch(() => {});
    fetch("/api/users/assignable")
      .then((r) => r.json())
      .then((d) => d.success && setTeam(d.data))
      .catch(() => {});
  }, [fetchMeetings]);

  const teamById = useMemo(() => new Map(team.map((u) => [u.id, u])), [team]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return meetings.filter((m) => {
      if (statusTab === "OPEN" && m.status === "DONE") return false;
      if (statusTab !== "OPEN" && statusTab !== "ALL" && m.status !== statusTab) return false;
      if (q) {
        const names = m.assigneeIds.map((id) => teamById.get(id)?.name || "").join(" ");
        const hay = `${m.title} ${m.client?.name || ""} ${m.client?.company || ""} ${m.notes || ""} ${names}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [meetings, statusTab, search, teamById]);

  const summary = useMemo(
    () => ({
      needsPickup: meetings.filter((m) => m.status === "NEW").length,
      inProgress: meetings.filter((m) => m.status === "IN_PROGRESS").length,
      done: meetings.filter((m) => m.status === "DONE").length,
      recorded: meetings.filter((m) => m.fathomUrl).length,
    }),
    [meetings]
  );

  async function handleAdd(values: MeetingFormValues) {
    const res = await fetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const result = await readJson<{ data: { id: string } }>(res, "Failed to post meeting. Please try again.");
    if (result.ok) {
      setShowAdd(false);
      toast("Handoff posted — assignees notified", "success");
      router.push(`/meetings/${result.data!.data.id}`);
    } else {
      toast(result.error!, "error");
    }
  }

  return (
    <div>
      <TopBar title="Meetings" subtitle="Take the call, post the handoff — the team runs with it" />
      <div className="px-4 lg:px-6 space-y-4">
        {/* Summary tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Needs Pickup", value: summary.needsPickup, icon: Inbox },
            { label: "In Progress", value: summary.inProgress, icon: Hammer },
            { label: "Done", value: summary.done, icon: CheckCircle2 },
            { label: "With Recording", value: summary.recorded, icon: Video },
          ].map((tile) => (
            <div key={tile.label} className="bg-bb-surface border border-bb-border rounded-lg p-4 flex items-center gap-3">
              <tile.icon size={18} className="text-bb-orange shrink-0" />
              <div className="min-w-0">
                <p className="text-lg font-semibold text-white truncate">{tile.value}</p>
                <p className="text-xs text-bb-dim truncate">{tile.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Status tabs + new button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex gap-1 bg-bb-surface border border-bb-border rounded-lg p-1 overflow-x-auto w-full sm:w-auto">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusTab(tab.key)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap",
                  statusTab === tab.key ? "bg-bb-orange text-white" : "text-bb-muted hover:text-white"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors shrink-0 ml-auto sm:ml-0"
          >
            <Plus size={16} />
            New Meeting
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-dim" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meetings, clients, notes, assignees…"
            className="w-full pl-9 pr-4 py-2 bg-bb-surface border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
          />
        </div>

        {/* List */}
        <div className="space-y-3 pb-8">
          {loading ? (
            <div className="text-center py-12 text-bb-dim">Loading meetings…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-bb-dim flex flex-col items-center gap-2">
              <Video size={32} className="text-bb-dim/50" />
              <p>
                {meetings.length === 0
                  ? "No meetings yet. Post your first handoff — notes, Fathom link, transcript — and assign whoever should run with it."
                  : "Nothing matches these filters."}
              </p>
            </div>
          ) : (
            filtered.map((m) => {
              const assignees = m.assigneeIds
                .map((id) => teamById.get(id))
                .filter(Boolean) as TeamOption[];
              return (
                <button
                  key={m.id}
                  onClick={() => router.push(`/meetings/${m.id}`)}
                  className="w-full text-left bg-bb-surface border border-bb-border hover:border-bb-orange/50 rounded-lg p-4 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">{m.title}</span>
                    <Badge variant={statusVariant[m.status] || "gray"}>{statusLabel[m.status] || m.status}</Badge>
                    {m.fathomUrl && <Video size={14} className="text-bb-orange" aria-label="Recording attached" />}
                    <span className="ml-auto text-xs text-bb-dim shrink-0">
                      {new Date(m.meetingDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap mt-2">
                    {m.client && (
                      <span className="text-xs text-bb-muted">{m.client.name}</span>
                    )}
                    {assignees.length > 0 && (
                      <span className="flex items-center gap-1">
                        {assignees.map((a) => (
                          <span
                            key={a.id}
                            title={a.name}
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold text-black/80 ring-1 ring-black/30"
                            style={{ backgroundColor: a.color || "#8a8a8a" }}
                          >
                            {a.name.charAt(0).toUpperCase()}
                          </span>
                        ))}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-bb-dim">
                      <ClipboardList size={12} /> {m._count.tasks}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-bb-dim">
                      <MessageSquare size={12} /> {m._count.comments}
                    </span>
                  </div>
                  {m.notes && (
                    <p className="text-xs text-bb-dim mt-2 line-clamp-2 whitespace-pre-line">{m.notes}</p>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* New meeting modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Meeting Handoff">
        <MeetingForm clients={clients} team={team} onSubmit={handleAdd} onCancel={() => setShowAdd(false)} />
      </Modal>
    </div>
  );
}
