"use client";

import {
  Zap, MessageSquare, Brain, GitBranch, Clock, Tag, Bell, ArrowRight, CircleStop,
  ListChecks, Variable, GripVertical,
} from "lucide-react";

const NODE_TYPES = [
  { type: "trigger", label: "Trigger", icon: Zap, color: "text-orange-400 bg-orange-500/10 border-orange-500/30", description: "Entry point" },
  { type: "message", label: "Message", icon: MessageSquare, color: "text-blue-400 bg-blue-500/10 border-blue-500/30", description: "Send text or media" },
  { type: "ai_response", label: "AI Response", icon: Brain, color: "text-purple-400 bg-purple-500/10 border-purple-500/30", description: "Claude generates reply" },
  { type: "quick_reply", label: "Quick Reply", icon: ListChecks, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30", description: "Buttons for user" },
  { type: "condition", label: "Condition", icon: GitBranch, color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30", description: "If/else branch" },
  { type: "delay", label: "Delay", icon: Clock, color: "text-amber-400 bg-amber-500/10 border-amber-500/30", description: "Wait timer" },
  { type: "tag", label: "Tag", icon: Tag, color: "text-green-400 bg-green-500/10 border-green-500/30", description: "Tag contact" },
  { type: "set_variable", label: "Set Variable", icon: Variable, color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30", description: "Store data" },
  { type: "notify", label: "Notify", icon: Bell, color: "text-red-400 bg-red-500/10 border-red-500/30", description: "Alert you" },
  { type: "goto", label: "Go To", icon: ArrowRight, color: "text-bb-muted bg-bb-elevated border-bb-border", description: "Jump to node" },
  { type: "end", label: "End", icon: CircleStop, color: "text-red-400 bg-red-500/10 border-red-500/30", description: "Stop flow" },
];

interface NodePaletteProps {
  onAddNode: (type: string) => void;
}

export default function NodePalette({ onAddNode }: NodePaletteProps) {
  return (
    <div className="w-56 bg-bb-surface border-r border-bb-border h-full overflow-y-auto">
      <div className="p-3 border-b border-bb-border">
        <h3 className="text-xs font-bold text-bb-muted uppercase tracking-wider">Nodes</h3>
        <p className="text-[10px] text-bb-dim mt-0.5">Click to add to canvas</p>
      </div>
      <div className="p-2 space-y-1">
        {NODE_TYPES.map((node) => {
          const Icon = node.icon;
          return (
            <button
              key={node.type}
              onClick={() => onAddNode(node.type)}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg border text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${node.color}`}
            >
              <Icon size={14} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white">{node.label}</p>
                <p className="text-[9px] text-bb-dim">{node.description}</p>
              </div>
              <GripVertical size={10} className="text-bb-dim" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
