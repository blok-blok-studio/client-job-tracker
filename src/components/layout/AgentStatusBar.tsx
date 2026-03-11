"use client";

import { Bot, Activity } from "lucide-react";

interface AgentStatusBarProps {
  isActive?: boolean;
  lastRun?: string;
  actionsToday?: number;
}

export default function AgentStatusBar({
  isActive = true,
  lastRun = "Never",
  actionsToday = 0,
}: AgentStatusBarProps) {
  return (
    <div className="bg-bb-surface border-b border-bb-border px-6 py-2 flex items-center justify-between text-xs">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-bb-muted" />
          <span
            className={`w-2 h-2 rounded-full ${isActive ? "bg-bb-orange animate-pulse" : "bg-bb-dim"}`}
          />
          <span className="text-bb-muted">
            Agent: {isActive ? "Running" : "Paused"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-bb-dim">
          <Activity size={12} />
          <span>Last run: {lastRun}</span>
        </div>
      </div>
      <div className="text-bb-dim">
        Actions today: <span className="text-bb-muted">{actionsToday}</span>
      </div>
    </div>
  );
}
