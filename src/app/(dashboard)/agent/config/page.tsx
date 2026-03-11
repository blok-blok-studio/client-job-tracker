"use client";

import { useState, useEffect } from "react";
import { Save, RotateCcw, Play } from "lucide-react";
import TopBar from "@/components/layout/TopBar";

interface AgentConfig {
  isActive: boolean;
  runIntervalMins: number;
  autoAssign: boolean;
  autoRemind: boolean;
  autoReport: boolean;
  allowedActions: string[];
  claudeModel: string;
  maxTokens: number;
  systemPrompt: string | null;
}

const ACTION_OPTIONS = [
  { key: "create_task", label: "Create Tasks" },
  { key: "move_task", label: "Move Tasks" },
  { key: "flag_overdue", label: "Flag Overdue" },
  { key: "send_reminder", label: "Send Reminders" },
  { key: "generate_report", label: "Generate Reports" },
  { key: "update_checklist", label: "Update Checklists" },
  { key: "create_checklist_item", label: "Create Checklist Items" },
  { key: "log_note", label: "Log Notes" },
];

const MODEL_OPTIONS = [
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

const DEFAULT_CONFIG: AgentConfig = {
  isActive: true,
  runIntervalMins: 30,
  autoAssign: true,
  autoRemind: true,
  autoReport: true,
  allowedActions: ["create_task", "move_task", "send_reminder", "generate_report", "flag_overdue"],
  claudeModel: "claude-sonnet-4-20250514",
  maxTokens: 4096,
  systemPrompt: null,
};

export default function AgentConfigPage() {
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/agent/status")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data.config) setConfig(d.data.config);
      });
  }, []);

  async function handleSave() {
    setSaving(true);
    await fetch("/api/agent/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
  }

  async function handleTestRun() {
    setTestRunning(true);
    setTestResult(null);
    const res = await fetch("/api/agent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
    });
    const data = await res.json();
    setTestResult(
      data.success
        ? `Dry run complete: ${data.data.actionsExecuted} actions would be taken. Analysis: ${data.data.analysis}`
        : `Error: ${data.error}`
    );
    setTestRunning(false);
  }

  function toggleAction(action: string) {
    setConfig((prev) => ({
      ...prev,
      allowedActions: prev.allowedActions.includes(action)
        ? prev.allowedActions.filter((a) => a !== action)
        : [...prev.allowedActions, action],
    }));
  }

  const inputClass = "w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50";

  return (
    <div>
      <TopBar title="Agent Configuration" subtitle="Configure agent behavior and permissions" />
      <div className="px-4 lg:px-6 pb-8 max-w-3xl space-y-4 lg:space-y-6">
        {/* Status */}
        <div className="bg-bb-surface border border-bb-border rounded-lg p-5 space-y-4">
          <h3 className="font-display font-semibold">General</h3>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium">Agent Active</span>
              <p className="text-xs text-bb-dim">Enable or pause the autonomous agent</p>
            </div>
            <button
              onClick={() => setConfig((p) => ({ ...p, isActive: !p.isActive }))}
              className={`w-12 h-6 rounded-full transition-colors ${config.isActive ? "bg-bb-orange" : "bg-bb-border"}`}
            >
              <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${config.isActive ? "translate-x-6" : "translate-x-0.5"}`} />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Run Interval: {config.runIntervalMins} minutes</label>
            <input
              type="range"
              min={5}
              max={120}
              step={5}
              value={config.runIntervalMins}
              onChange={(e) => setConfig((p) => ({ ...p, runIntervalMins: parseInt(e.target.value) }))}
              className="w-full accent-bb-orange"
            />
            <div className="flex justify-between text-xs text-bb-dim">
              <span>5 min</span>
              <span>120 min</span>
            </div>
          </div>
        </div>

        {/* Toggles */}
        <div className="bg-bb-surface border border-bb-border rounded-lg p-5 space-y-4">
          <h3 className="font-display font-semibold">Automation</h3>
          {[
            { key: "autoAssign" as const, label: "Auto-assign new tasks", desc: "Automatically assign new tasks to the agent" },
            { key: "autoRemind" as const, label: "Auto-remind on deadlines", desc: "Send reminders when deadlines approach" },
            { key: "autoReport" as const, label: "Auto-generate reports", desc: "Generate daily and weekly summaries" },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">{item.label}</span>
                <p className="text-xs text-bb-dim">{item.desc}</p>
              </div>
              <button
                onClick={() => setConfig((p) => ({ ...p, [item.key]: !p[item.key] }))}
                className={`w-12 h-6 rounded-full transition-colors ${config[item.key] ? "bg-bb-orange" : "bg-bb-border"}`}
              >
                <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${config[item.key] ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
            </div>
          ))}
        </div>

        {/* Allowed Actions */}
        <div className="bg-bb-surface border border-bb-border rounded-lg p-5 space-y-4">
          <h3 className="font-display font-semibold">Allowed Actions</h3>
          <div className="grid grid-cols-2 gap-2">
            {ACTION_OPTIONS.map((action) => (
              <label key={action.key} className="flex items-center gap-2 p-2 rounded hover:bg-bb-elevated cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.allowedActions.includes(action.key)}
                  onChange={() => toggleAction(action.key)}
                  className="w-4 h-4 accent-bb-orange"
                />
                <span className="text-sm">{action.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Model Settings */}
        <div className="bg-bb-surface border border-bb-border rounded-lg p-5 space-y-4">
          <h3 className="font-display font-semibold">Model</h3>
          <div>
            <label className="block text-sm text-bb-muted mb-1">Claude Model</label>
            <select value={config.claudeModel} onChange={(e) => setConfig((p) => ({ ...p, claudeModel: e.target.value }))} className={inputClass}>
              {MODEL_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-bb-muted mb-1">Max Tokens</label>
            <input type="number" value={config.maxTokens} onChange={(e) => setConfig((p) => ({ ...p, maxTokens: parseInt(e.target.value) || 4096 }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm text-bb-muted mb-1">Custom System Prompt</label>
            <textarea
              value={config.systemPrompt || ""}
              onChange={(e) => setConfig((p) => ({ ...p, systemPrompt: e.target.value || null }))}
              rows={6}
              className={inputClass + " font-mono"}
              placeholder="Leave empty to use default system prompt..."
            />
          </div>
        </div>

        {/* Test Run */}
        {testResult && (
          <div className="bg-bb-surface border border-bb-border rounded-lg p-5">
            <h3 className="font-display font-semibold mb-2">Test Run Result</h3>
            <pre className="text-sm text-bb-muted whitespace-pre-wrap font-mono">{testResult}</pre>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white rounded-md text-sm font-medium disabled:opacity-50">
            <Save size={14} /> {saving ? "Saving..." : "Save Configuration"}
          </button>
          <button onClick={handleTestRun} disabled={testRunning} className="flex items-center gap-2 px-4 py-2 bg-bb-elevated hover:bg-bb-border rounded-md text-sm text-bb-muted disabled:opacity-50">
            <Play size={14} /> {testRunning ? "Running..." : "Test Run (Dry)"}
          </button>
          <button onClick={() => setConfig(DEFAULT_CONFIG)} className="flex items-center gap-2 px-4 py-2 text-sm text-bb-dim hover:text-white">
            <RotateCcw size={14} /> Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
}
