import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import Badge from "@/components/shared/Badge";

interface ActivityEntry {
  id: string;
  action: string;
  details: string | null;
  clientName: string | null;
  createdAt: string;
}

const actionVariants: Record<string, "blue" | "green" | "red" | "yellow" | "purple" | "orange" | "gray"> = {
  create_task: "blue",
  created_task: "blue",
  move_task: "green",
  moved_task: "green",
  flag_overdue: "red",
  flagged_overdue: "red",
  send_reminder: "yellow",
  sent_reminder: "yellow",
  generate_report: "purple",
  generated_report: "purple",
  suggest_action: "orange",
  suggested_action: "orange",
  log_note: "gray",
  logged_note: "gray",
};

export default function AgentActivityFeed({ activities }: { activities: ActivityEntry[] }) {
  return (
    <div className="bg-bb-surface border border-bb-border rounded-lg">
      <div className="px-5 py-4 border-b border-bb-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-bb-orange animate-pulse" />
          <h2 className="font-display font-semibold">Agent Activity</h2>
        </div>
        <Link href="/agent" className="text-xs text-bb-orange hover:text-bb-orange-light">
          View All
        </Link>
      </div>
      <div className="divide-y divide-bb-border max-h-[500px] overflow-y-auto">
        {activities.length === 0 ? (
          <p className="px-5 py-8 text-center text-bb-dim text-sm">No agent activity yet</p>
        ) : (
          activities.map((entry) => (
            <div key={entry.id} className="px-5 py-3 hover:bg-bb-elevated/50 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={actionVariants[entry.action] || "gray"} size="sm">
                  {entry.action.replace(/_/g, " ")}
                </Badge>
                {entry.clientName && (
                  <span className="text-xs text-bb-dim">{entry.clientName}</span>
                )}
              </div>
              {entry.details && (
                <p className="text-sm text-bb-muted line-clamp-1">{entry.details}</p>
              )}
              <span className="text-xs text-bb-dim">
                {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
