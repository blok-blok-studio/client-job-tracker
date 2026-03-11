"use client";

import { useState, useEffect, useCallback } from "react";
import { Play, Pause, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import TopBar from "@/components/layout/TopBar";
import Badge from "@/components/shared/Badge";

interface AgentStatus {
  config: { isActive: boolean; runIntervalMins: number } | null;
  lastRun: string | null;
  actionsToday: number;
  nextRun: string | null;
}

interface Activity {
  id: string;
  action: string;
  details: string | null;
  client: { name: string } | null;
  createdAt: string;
}

interface Suggestion {
  id: string;
  details: string;
  createdAt: string;
}

const actionVariants: Record<string, "blue" | "green" | "red" | "yellow" | "purple" | "orange" | "gray"> = {
  created_task: "blue",
  moved_task: "green",
  flagged_overdue: "red",
  sent_reminder: "yellow",
  generated_report: "purple",
  suggested_action: "orange",
  logged_note: "gray",
  cycle_started: "gray",
  cycle_completed: "green",
  cycle_error: "red",
};

export default function AgentPage() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [running, setRunning] = useState(false);

  const fetchData = useCallback(async () => {
    const [statusRes, activityRes, suggestionsRes] = await Promise.all([
      fetch("/api/agent/status"),
      fetch("/api/agent/activity?limit=50"),
      fetch("/api/agent/suggestions"),
    ]);
    const [s, a, sg] = await Promise.all([statusRes.json(), activityRes.json(), suggestionsRes.json()]);
    if (s.success) setStatus(s.data);
    if (a.success) setActivities(a.data);
    if (sg.success) setSuggestions(sg.data);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleToggleActive() {
    const isActive = !status?.config?.isActive;
    await fetch("/api/agent/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    fetchData();
  }

  async function handleRunNow() {
    setRunning(true);
    try {
      await fetch("/api/agent/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      await fetchData();
    } finally {
      setRunning(false);
    }
  }

  async function handleApproveSuggestion(id: string) {
    await fetch(`/api/agent/suggestions/${id}/approve`, { method: "POST" });
    fetchData();
  }

  async function handleDismissSuggestion(id: string) {
    await fetch(`/api/agent/suggestions/${id}/dismiss`, { method: "POST" });
    fetchData();
  }

  return (
    <div>
      <TopBar title="Agent" subtitle="AI agent activity and controls" />
      <div className="px-4 lg:px-6 pb-8 space-y-4 lg:space-y-6">
        {/* Status Banner */}
        <div className="bg-bb-surface border border-bb-border rounded-lg p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className={`w-4 h-4 rounded-full ${status?.config?.isActive ? "bg-bb-orange animate-pulse" : "bg-bb-dim"}`} />
                <span className="font-display font-semibold text-lg">
                  Agent: {status?.config?.isActive ? "Active" : "Paused"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-bb-dim">
                <span>Last run: {status?.lastRun ? formatDistanceToNow(new Date(status.lastRun), { addSuffix: true }) : "Never"}</span>
                {status?.nextRun && <span>Next run: {formatDistanceToNow(new Date(status.nextRun), { addSuffix: true })}</span>}
                <span>Actions today: <span className="text-bb-muted">{status?.actionsToday || 0}</span></span>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={handleToggleActive}
                className="flex items-center gap-2 px-4 py-2 bg-bb-elevated hover:bg-bb-border rounded-md text-sm transition-colors"
              >
                {status?.config?.isActive ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Resume</>}
              </button>
              <button
                onClick={handleRunNow}
                disabled={running}
                className="flex items-center gap-2 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white rounded-md text-sm transition-colors disabled:opacity-50"
              >
                <RefreshCw size={14} className={running ? "animate-spin" : ""} />
                {running ? "Running..." : "Run Now"}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Activity Feed */}
          <div className="lg:col-span-2 bg-bb-surface border border-bb-border rounded-lg">
            <div className="px-5 py-4 border-b border-bb-border">
              <h2 className="font-display font-semibold">Activity Log</h2>
            </div>
            <div className="divide-y divide-bb-border max-h-[600px] overflow-y-auto">
              {activities.map((entry) => {
                let details = entry.details;
                try { details = JSON.stringify(JSON.parse(entry.details || ""), null, 2); } catch { /* keep as-is */ }

                return (
                  <div key={entry.id} className="px-5 py-3 hover:bg-bb-elevated/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={actionVariants[entry.action] || "gray"} size="sm">
                        {entry.action.replace(/_/g, " ")}
                      </Badge>
                      {entry.client && <span className="text-xs text-bb-dim">{entry.client.name}</span>}
                      <span className="text-xs text-bb-dim ml-auto">
                        {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    {details && <pre className="text-xs text-bb-muted mt-1 line-clamp-3 whitespace-pre-wrap font-mono">{details}</pre>}
                  </div>
                );
              })}
              {activities.length === 0 && (
                <div className="px-5 py-12 text-center text-bb-dim text-sm">No agent activity yet. Click &quot;Run Now&quot; to start.</div>
              )}
            </div>
          </div>

          {/* Suggestions Panel */}
          <div className="bg-bb-surface border border-bb-border rounded-lg">
            <div className="px-5 py-4 border-b border-bb-border">
              <h2 className="font-display font-semibold">Suggestions</h2>
            </div>
            <div className="divide-y divide-bb-border max-h-[600px] overflow-y-auto">
              {suggestions.map((s) => {
                let parsed: { suggestion?: string; reasoning?: string; urgency?: string } = {};
                try { parsed = JSON.parse(s.details); } catch { /* ignore */ }
                return (
                  <div key={s.id} className="px-5 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      {parsed.urgency && (
                        <Badge variant={parsed.urgency === "high" ? "red" : parsed.urgency === "medium" ? "yellow" : "gray"} size="sm">
                          {parsed.urgency}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm mb-1">{parsed.suggestion || s.details}</p>
                    {parsed.reasoning && <p className="text-xs text-bb-dim mb-2">{parsed.reasoning}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => handleApproveSuggestion(s.id)} className="flex items-center gap-1 px-2 py-1 text-xs text-green-400 hover:bg-green-500/10 rounded">
                        <CheckCircle size={12} /> Approve
                      </button>
                      <button onClick={() => handleDismissSuggestion(s.id)} className="flex items-center gap-1 px-2 py-1 text-xs text-bb-dim hover:bg-bb-elevated rounded">
                        <XCircle size={12} /> Dismiss
                      </button>
                    </div>
                  </div>
                );
              })}
              {suggestions.length === 0 && (
                <div className="px-5 py-12 text-center text-bb-dim text-sm">No pending suggestions</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
