"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Zap, MessageSquare, Brain, GitBranch, Clock, Tag, Bell, ArrowRight, CircleStop,
  ListChecks, Variable,
} from "lucide-react";

const handleStyle = { width: 8, height: 8, background: "#f97316" };

// Helper to safely extract string values from node data
function d(data: NodeProps["data"], key: string, fallback = ""): string {
  const val = (data as Record<string, unknown>)[key];
  if (typeof val === "string") return val || fallback;
  if (typeof val === "number") return String(val);
  return fallback;
}

function dArr(data: NodeProps["data"], key: string): { label: string; value: string }[] {
  const val = (data as Record<string, unknown>)[key];
  return Array.isArray(val) ? val : [];
}

function dStrArr(data: NodeProps["data"], key: string): string[] {
  const val = (data as Record<string, unknown>)[key];
  return Array.isArray(val) ? val : [];
}

// ─── Trigger Node ─────────────────────────────────────────────────────────

export const TriggerNode = memo(({ data }: NodeProps) => {
  const keywords = dStrArr(data, "keywords");
  return (
    <div className="bg-gradient-to-br from-orange-500/20 to-pink-500/20 border-2 border-orange-500 rounded-xl px-4 py-3 min-w-[180px] shadow-lg">
      <div className="flex items-center gap-2 mb-1">
        <Zap size={14} className="text-orange-400" />
        <span className="text-xs font-bold text-orange-300 uppercase tracking-wide">Trigger</span>
      </div>
      <p className="text-sm text-white font-medium">{d(data, "label", "When message received")}</p>
      {keywords.length > 0 && (
        <p className="text-[10px] text-orange-200/60 mt-1">Keywords: {keywords.join(", ")}</p>
      )}
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
    </div>
  );
});
TriggerNode.displayName = "TriggerNode";

// ─── Message Node ─────────────────────────────────────────────────────────

export const MessageNode = memo(({ data }: NodeProps) => (
  <div className="bg-bb-surface border border-bb-border rounded-xl px-4 py-3 min-w-[200px] shadow-lg">
    <Handle type="target" position={Position.Top} style={handleStyle} />
    <div className="flex items-center gap-2 mb-1">
      <MessageSquare size={14} className="text-blue-400" />
      <span className="text-xs font-semibold text-blue-300">Send Message</span>
    </div>
    <p className="text-sm text-white/80 line-clamp-3">{d(data, "text", "Message text...")}</p>
    {d(data, "mediaUrl") ? <p className="text-[10px] text-bb-dim mt-1">+ Media attached</p> : null}
    <Handle type="source" position={Position.Bottom} style={handleStyle} />
  </div>
));
MessageNode.displayName = "MessageNode";

// ─── AI Response Node ─────────────────────────────────────────────────────

export const AIResponseNode = memo(({ data }: NodeProps) => (
  <div className="bg-purple-500/10 border border-purple-500/50 rounded-xl px-4 py-3 min-w-[200px] shadow-lg">
    <Handle type="target" position={Position.Top} style={handleStyle} />
    <div className="flex items-center gap-2 mb-1">
      <Brain size={14} className="text-purple-400" />
      <span className="text-xs font-semibold text-purple-300">AI Response</span>
    </div>
    <p className="text-sm text-white/80 line-clamp-2">{d(data, "systemPrompt") ? "Custom prompt set" : "Claude generates reply"}</p>
    <Handle type="source" position={Position.Bottom} style={handleStyle} />
  </div>
));
AIResponseNode.displayName = "AIResponseNode";

// ─── Condition Node ───────────────────────────────────────────────────────

export const ConditionNode = memo(({ data }: NodeProps) => (
  <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-xl px-4 py-3 min-w-[180px] shadow-lg">
    <Handle type="target" position={Position.Top} style={handleStyle} />
    <div className="flex items-center gap-2 mb-1">
      <GitBranch size={14} className="text-yellow-400" />
      <span className="text-xs font-semibold text-yellow-300">Condition</span>
    </div>
    <p className="text-sm text-white/80">
      {d(data, "field", "message")} {d(data, "operator", "contains")} &quot;{d(data, "value", "...")}&quot;
    </p>
    <Handle type="source" position={Position.Bottom} id="yes" style={{ ...handleStyle, left: "30%", background: "#22c55e" }} />
    <Handle type="source" position={Position.Bottom} id="no" style={{ ...handleStyle, left: "70%", background: "#ef4444" }} />
    <div className="flex justify-between mt-2 text-[9px]">
      <span className="text-green-400 ml-2">Yes</span>
      <span className="text-red-400 mr-2">No</span>
    </div>
  </div>
));
ConditionNode.displayName = "ConditionNode";

// ─── Quick Reply Node ─────────────────────────────────────────────────────

export const QuickReplyNode = memo(({ data }: NodeProps) => {
  const options = dArr(data, "options");
  return (
    <div className="bg-cyan-500/10 border border-cyan-500/50 rounded-xl px-4 py-3 min-w-[200px] shadow-lg">
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <div className="flex items-center gap-2 mb-1">
        <ListChecks size={14} className="text-cyan-400" />
        <span className="text-xs font-semibold text-cyan-300">Quick Reply</span>
      </div>
      <p className="text-sm text-white/80 mb-2">{d(data, "text", "Choose an option:")}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((opt, i) => (
          <span key={i} className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full">{opt.label}</span>
        ))}
      </div>
      {options.map((opt, i) => (
        <Handle
          key={i}
          type="source"
          position={Position.Bottom}
          id={opt.value}
          style={{ ...handleStyle, left: `${((i + 1) / (options.length + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
});
QuickReplyNode.displayName = "QuickReplyNode";

// ─── Delay Node ───────────────────────────────────────────────────────────

export const DelayNode = memo(({ data }: NodeProps) => (
  <div className="bg-bb-surface border border-bb-border rounded-xl px-4 py-3 min-w-[140px] shadow-lg">
    <Handle type="target" position={Position.Top} style={handleStyle} />
    <div className="flex items-center gap-2 mb-1">
      <Clock size={14} className="text-amber-400" />
      <span className="text-xs font-semibold text-amber-300">Delay</span>
    </div>
    <p className="text-sm text-white/80">{d(data, "duration", "5")} {d(data, "unit", "seconds")}</p>
    <Handle type="source" position={Position.Bottom} style={handleStyle} />
  </div>
));
DelayNode.displayName = "DelayNode";

// ─── Tag Node ─────────────────────────────────────────────────────────────

export const TagNode = memo(({ data }: NodeProps) => (
  <div className="bg-bb-surface border border-bb-border rounded-xl px-4 py-3 min-w-[140px] shadow-lg">
    <Handle type="target" position={Position.Top} style={handleStyle} />
    <div className="flex items-center gap-2 mb-1">
      <Tag size={14} className="text-green-400" />
      <span className="text-xs font-semibold text-green-300">Tag Contact</span>
    </div>
    <p className="text-sm text-white/80">{d(data, "tagName", "tag_name")}</p>
    <Handle type="source" position={Position.Bottom} style={handleStyle} />
  </div>
));
TagNode.displayName = "TagNode";

// ─── Notify Node ──────────────────────────────────────────────────────────

export const NotifyNode = memo(({ data }: NodeProps) => (
  <div className="bg-bb-surface border border-bb-border rounded-xl px-4 py-3 min-w-[160px] shadow-lg">
    <Handle type="target" position={Position.Top} style={handleStyle} />
    <div className="flex items-center gap-2 mb-1">
      <Bell size={14} className="text-red-400" />
      <span className="text-xs font-semibold text-red-300">Notify</span>
    </div>
    <p className="text-sm text-white/80 line-clamp-2">{d(data, "message", "Send notification")}</p>
    <Handle type="source" position={Position.Bottom} style={handleStyle} />
  </div>
));
NotifyNode.displayName = "NotifyNode";

// ─── Set Variable Node ────────────────────────────────────────────────────

export const SetVariableNode = memo(({ data }: NodeProps) => (
  <div className="bg-bb-surface border border-bb-border rounded-xl px-4 py-3 min-w-[160px] shadow-lg">
    <Handle type="target" position={Position.Top} style={handleStyle} />
    <div className="flex items-center gap-2 mb-1">
      <Variable size={14} className="text-indigo-400" />
      <span className="text-xs font-semibold text-indigo-300">Set Variable</span>
    </div>
    <p className="text-sm text-white/80">{d(data, "variableName", "var")} = {d(data, "variableValue", "value")}</p>
    <Handle type="source" position={Position.Bottom} style={handleStyle} />
  </div>
));
SetVariableNode.displayName = "SetVariableNode";

// ─── Goto Node ────────────────────────────────────────────────────────────

export const GotoNode = memo(({ data }: NodeProps) => (
  <div className="bg-bb-surface border border-bb-border rounded-xl px-4 py-3 min-w-[140px] shadow-lg">
    <Handle type="target" position={Position.Top} style={handleStyle} />
    <div className="flex items-center gap-2 mb-1">
      <ArrowRight size={14} className="text-bb-muted" />
      <span className="text-xs font-semibold text-bb-muted">Go To</span>
    </div>
    <p className="text-sm text-white/80">{d(data, "label", "Jump to node")}</p>
    <Handle type="source" position={Position.Bottom} style={handleStyle} />
  </div>
));
GotoNode.displayName = "GotoNode";

// ─── End Node ─────────────────────────────────────────────────────────────

export const EndNode = memo(() => (
  <div className="bg-red-500/10 border border-red-500/50 rounded-xl px-4 py-3 min-w-[120px] shadow-lg text-center">
    <Handle type="target" position={Position.Top} style={handleStyle} />
    <div className="flex items-center justify-center gap-2">
      <CircleStop size={14} className="text-red-400" />
      <span className="text-xs font-semibold text-red-300">End Flow</span>
    </div>
  </div>
));
EndNode.displayName = "EndNode";

// ─── Node Type Map (for reactflow) ───────────────────────────────────────

export const nodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  ai_response: AIResponseNode,
  condition: ConditionNode,
  quick_reply: QuickReplyNode,
  delay: DelayNode,
  tag: TagNode,
  notify: NotifyNode,
  set_variable: SetVariableNode,
  goto: GotoNode,
  end: EndNode,
};
