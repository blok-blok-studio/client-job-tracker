"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import Badge from "@/components/shared/Badge";
import { formatRelativeDate } from "@/lib/utils";

interface ActivityItem {
  id: string;
  actor: string;
  action: string;
  details: string | null;
  clientId: string | null;
  clientName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  createdAt: string;
}

const ACTOR_COLORS: Record<string, "orange" | "blue" | "green" | "gray" | "yellow"> = {
  agent: "orange",
  chase: "blue",
  client: "green",
  stripe: "yellow",
  system: "gray",
};

const ACTION_ICONS: Record<string, string> = {
  payment_received: "$",
  subscription_started: "$",
  payment_failed: "!",
  subscription_cancelled: "X",
  payment_link_created: "$",
  pipeline_onboard_sent: ">",
  pipeline_contract_sent: ">",
  pipeline_contract_created: "+",
  onboarding_completed: "O",
  contract_signed: "S",
  created_task: "+",
  moved_task: ">",
  flagged_overdue: "!",
  sent_reminder: "R",
  replied_support_ticket: "T",
  closed_stale_ticket: "X",
  logged_note: "N",
  archived_client: "A",
};

const POLL_INTERVAL = 10_000; // 10 seconds

export default function ActivityPage() {
  const router = useRouter();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "agent" | "stripe" | "client" | "chase">("all");
  const [isLive, setIsLive] = useState(true);
  const lastFetchRef = useRef<string | null>(null);

  const fetchActivities = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filter !== "all") params.set("actor", filter);

      const res = await fetch(`/api/dashboard/activity?${params}`);
      const json = await res.json();
      if (json.success) {
        setActivities(json.data);
        if (json.data.length > 0) {
          lastFetchRef.current = json.data[0].id;
        }
      }
    } catch (err) {
      console.error("Failed to fetch activities:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    fetchActivities();
  }, [fetchActivities]);

  // Auto-refresh polling
  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(fetchActivities, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [isLive, fetchActivities]);

  return (
    <>
      <TopBar title="Activity Log" />
      <div className="p-4 lg:p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold">Activity Log</h1>
            <p className="text-bb-dim text-sm mt-1">Real-time tracking across all clients</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsLive(!isLive)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isLive
                  ? "bg-green-500/10 text-green-400 border border-green-500/30"
                  : "bg-bb-surface text-bb-muted border border-bb-border"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isLive ? "bg-green-400 animate-pulse" : "bg-bb-muted"}`} />
              {isLive ? "Live" : "Paused"}
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {(["all", "agent", "stripe", "client", "chase"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                filter === f
                  ? "bg-bb-orange/10 text-bb-orange border border-bb-orange/30"
                  : "bg-bb-surface text-bb-muted border border-bb-border hover:border-bb-orange/20"
              }`}
            >
              {f === "all" ? "All Activity" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Activity list */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-bb-surface border border-bb-border rounded-lg p-4 animate-pulse">
                <div className="h-4 bg-bb-border rounded w-3/4 mb-2" />
                <div className="h-3 bg-bb-border rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-16 text-bb-dim">No activity found</div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[19px] top-0 bottom-0 w-px bg-bb-border" />

            <div className="space-y-1">
              {activities.map((activity, i) => {
                const icon = ACTION_ICONS[activity.action] || "*";
                const actorColor = ACTOR_COLORS[activity.actor] || "gray";
                const showDate =
                  i === 0 ||
                  new Date(activity.createdAt).toDateString() !==
                    new Date(activities[i - 1].createdAt).toDateString();

                return (
                  <div key={activity.id}>
                    {showDate && (
                      <div className="flex items-center gap-3 py-3 pl-11">
                        <span className="text-xs font-medium text-bb-dim uppercase tracking-wide">
                          {new Date(activity.createdAt).toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        <div className="flex-1 h-px bg-bb-border" />
                      </div>
                    )}
                    <div className="flex items-start gap-3 group hover:bg-bb-surface/50 rounded-lg px-2 py-2.5 transition-colors">
                      {/* Icon */}
                      <div className="relative z-10 flex-shrink-0 w-[22px] h-[22px] rounded-full bg-bb-surface border border-bb-border flex items-center justify-center text-[10px] font-bold text-bb-dim">
                        {icon}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={actorColor} className="text-[10px]">
                            {activity.actor}
                          </Badge>
                          <span className="text-sm text-white font-medium">
                            {formatActionLabel(activity.action)}
                          </span>
                          {activity.clientName && (
                            <button
                              onClick={() => router.push(`/clients/${activity.clientId}`)}
                              className="text-sm text-bb-orange hover:underline"
                            >
                              {activity.clientName}
                            </button>
                          )}
                          <span className="text-xs text-bb-dim ml-auto flex-shrink-0">
                            {formatRelativeDate(new Date(activity.createdAt))}
                          </span>
                        </div>
                        {activity.details && (
                          <p className="text-sm text-bb-muted mt-0.5 line-clamp-2">
                            {activity.details}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function formatActionLabel(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
