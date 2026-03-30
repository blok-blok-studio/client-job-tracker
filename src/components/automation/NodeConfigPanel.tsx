"use client";

import { useState, useEffect } from "react";
import { X, Plus, Minus } from "lucide-react";
import { DEFAULT_PROMPTS } from "@/lib/automation/ai-responder";

interface NodeConfigPanelProps {
  node: { id: string; type: string; data: Record<string, unknown> } | null;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function NodeConfigPanel({ node, onUpdate, onClose }: NodeConfigPanelProps) {
  const [data, setData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (node) setData({ ...node.data });
  }, [node]);

  if (!node) return null;

  const update = (key: string, value: unknown) => {
    const newData = { ...data, [key]: value };
    setData(newData);
    onUpdate(node.id, newData);
  };

  const inputClass = "w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-white text-sm";
  const labelClass = "block text-xs font-medium text-bb-muted mb-1";

  return (
    <div className="w-80 bg-bb-surface border-l border-bb-border h-full overflow-y-auto">
      <div className="flex items-center justify-between p-3 border-b border-bb-border">
        <h3 className="text-sm font-semibold text-white capitalize">{node.type.replace("_", " ")} Settings</h3>
        <button onClick={onClose} className="text-bb-dim hover:text-white">
          <X size={16} />
        </button>
      </div>

      <div className="p-3 space-y-4">
        {/* Trigger Node */}
        {node.type === "trigger" && (
          <>
            <div>
              <label className={labelClass}>Label</label>
              <input value={(data.label as string) || ""} onChange={(e) => update("label", e.target.value)} className={inputClass} placeholder="When message received" />
            </div>
            <div>
              <label className={labelClass}>Keywords (comma-separated)</label>
              <input
                value={((data.keywords as string[]) || []).join(", ")}
                onChange={(e) => update("keywords", e.target.value.split(",").map((k) => k.trim()).filter(Boolean))}
                className={inputClass}
                placeholder="price, info, book"
              />
            </div>
            <div>
              <label className={labelClass}>Match Type</label>
              <select value={(data.matchType as string) || "contains"} onChange={(e) => update("matchType", e.target.value)} className={inputClass}>
                <option value="contains">Contains</option>
                <option value="exact">Exact Match</option>
                <option value="starts_with">Starts With</option>
              </select>
            </div>
          </>
        )}

        {/* Message Node */}
        {node.type === "message" && (
          <>
            <div>
              <label className={labelClass}>Message Text</label>
              <textarea
                value={(data.text as string) || ""}
                onChange={(e) => update("text", e.target.value)}
                className={`${inputClass} resize-none`}
                rows={4}
                placeholder="Hey {{contactName}}! Thanks for reaching out..."
              />
              <p className="text-[10px] text-bb-dim mt-1">Use {"{{variableName}}"} for dynamic values</p>
            </div>
            <div>
              <label className={labelClass}>Media URL (optional)</label>
              <input value={(data.mediaUrl as string) || ""} onChange={(e) => update("mediaUrl", e.target.value)} className={inputClass} placeholder="https://..." />
            </div>
          </>
        )}

        {/* AI Response Node */}
        {node.type === "ai_response" && (
          <>
            <div>
              <label className={labelClass}>System Prompt</label>
              <textarea
                value={(data.systemPrompt as string) || ""}
                onChange={(e) => update("systemPrompt", e.target.value)}
                className={`${inputClass} resize-none`}
                rows={6}
                placeholder="You are a helpful sales assistant..."
              />
            </div>
            <div>
              <label className={labelClass}>Quick Prompts</label>
              <div className="flex flex-wrap gap-1">
                {Object.entries(DEFAULT_PROMPTS).map(([key, prompt]) => (
                  <button
                    key={key}
                    onClick={() => update("systemPrompt", prompt)}
                    className="text-[10px] px-2 py-1 bg-purple-500/20 text-purple-300 rounded-full hover:bg-purple-500/30"
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass}>Max Tokens</label>
              <input type="number" value={(data.maxTokens as number) || 300} onChange={(e) => update("maxTokens", parseInt(e.target.value))} className={inputClass} />
            </div>
          </>
        )}

        {/* Condition Node */}
        {node.type === "condition" && (
          <>
            <div>
              <label className={labelClass}>Check Field</label>
              <select value={(data.field as string) || "lastMessage"} onChange={(e) => update("field", e.target.value)} className={inputClass}>
                <option value="lastMessage">Last Message</option>
                <option value="lastQuickReplyPayload">Quick Reply Selection</option>
                <option value="contactName">Contact Name</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Operator</label>
              <select value={(data.operator as string) || "contains"} onChange={(e) => update("operator", e.target.value)} className={inputClass}>
                <option value="contains">Contains</option>
                <option value="not_contains">Does Not Contain</option>
                <option value="equals">Equals</option>
                <option value="not_equals">Does Not Equal</option>
                <option value="starts_with">Starts With</option>
                <option value="exists">Has Value</option>
                <option value="not_exists">Is Empty</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Value</label>
              <input value={(data.value as string) || ""} onChange={(e) => update("value", e.target.value)} className={inputClass} placeholder="price" />
            </div>
          </>
        )}

        {/* Quick Reply Node */}
        {node.type === "quick_reply" && (
          <>
            <div>
              <label className={labelClass}>Prompt Text</label>
              <input value={(data.text as string) || ""} onChange={(e) => update("text", e.target.value)} className={inputClass} placeholder="What are you interested in?" />
            </div>
            <div>
              <label className={labelClass}>Options</label>
              {((data.options as { label: string; value: string }[]) || []).map((opt, i) => (
                <div key={i} className="flex gap-1 mb-1">
                  <input
                    value={opt.label}
                    onChange={(e) => {
                      const opts = [...((data.options as { label: string; value: string }[]) || [])];
                      opts[i] = { ...opts[i], label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, "_") };
                      update("options", opts);
                    }}
                    className={`${inputClass} flex-1`}
                    placeholder={`Option ${i + 1}`}
                  />
                  <button
                    onClick={() => {
                      const opts = ((data.options as { label: string; value: string }[]) || []).filter((_, j) => j !== i);
                      update("options", opts);
                    }}
                    className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
                  >
                    <Minus size={12} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  const opts = [...((data.options as { label: string; value: string }[]) || []), { label: "", value: "" }];
                  update("options", opts);
                }}
                className="flex items-center gap-1 text-xs text-bb-orange hover:text-bb-orange-light mt-1"
              >
                <Plus size={12} /> Add Option
              </button>
            </div>
          </>
        )}

        {/* Delay Node */}
        {node.type === "delay" && (
          <>
            <div>
              <label className={labelClass}>Duration</label>
              <input type="number" value={(data.duration as number) || 5} onChange={(e) => update("duration", parseInt(e.target.value))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Unit</label>
              <select value={(data.unit as string) || "seconds"} onChange={(e) => update("unit", e.target.value)} className={inputClass}>
                <option value="seconds">Seconds</option>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </select>
            </div>
          </>
        )}

        {/* Tag Node */}
        {node.type === "tag" && (
          <div>
            <label className={labelClass}>Tag Name</label>
            <input value={(data.tagName as string) || ""} onChange={(e) => update("tagName", e.target.value)} className={inputClass} placeholder="qualified_lead" />
          </div>
        )}

        {/* Set Variable Node */}
        {node.type === "set_variable" && (
          <>
            <div>
              <label className={labelClass}>Variable Name</label>
              <input value={(data.variableName as string) || ""} onChange={(e) => update("variableName", e.target.value)} className={inputClass} placeholder="userEmail" />
            </div>
            <div>
              <label className={labelClass}>Value</label>
              <input value={(data.variableValue as string) || ""} onChange={(e) => update("variableValue", e.target.value)} className={inputClass} placeholder="{{lastMessage}}" />
            </div>
          </>
        )}

        {/* Notify Node */}
        {node.type === "notify" && (
          <>
            <div>
              <label className={labelClass}>Channel</label>
              <select value={(data.channel as string) || "telegram"} onChange={(e) => update("channel", e.target.value)} className={inputClass}>
                <option value="telegram">Telegram</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Message</label>
              <textarea
                value={(data.message as string) || ""}
                onChange={(e) => update("message", e.target.value)}
                className={`${inputClass} resize-none`}
                rows={3}
                placeholder="New qualified lead: {{contactName}}"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
