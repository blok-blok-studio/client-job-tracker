"use client";

import { useState, useEffect, useCallback } from "react";
import { Mail, GitBranch, FlaskConical, Settings2, Pencil } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import Badge from "@/components/shared/Badge";
import { cn } from "@/lib/utils";
import TemplateEditor from "@/components/automations/TemplateEditor";
import SequencesTab, { type SequenceRow } from "@/components/automations/SequencesTab";
import SettingsTab, { type LifecycleSettings } from "@/components/automations/SettingsTab";
import DryRunTab from "@/components/automations/DryRunTab";
import { fmtDateTime } from "@/components/automations/helpers";

interface TemplateRow {
  key: string;
  name: string;
  subject: string;
  kind: string;
  trigger: string;
  updatedAt: string;
  updatedBy: string | null;
}

const TABS = [
  { key: "templates", label: "Templates", icon: Mail },
  { key: "sequences", label: "Sequences", icon: GitBranch },
  { key: "dry-run", label: "Test run", icon: FlaskConical },
  { key: "settings", label: "Settings", icon: Settings2 },
];

const KIND_BADGE: Record<string, { label: string; variant: "orange" | "blue" | "gray" }> = {
  SEQUENCE_EMAIL: { label: "Auto email", variant: "orange" },
  SEQUENCE_DRAFT: { label: "Draft, human sends", variant: "blue" },
  SNIPPET: { label: "Manual snippet", variant: "gray" },
};

export default function AutomationsPage() {
  const [tab, setTab] = useState("templates");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [sequences, setSequences] = useState<SequenceRow[]>([]);
  const [settings, setSettings] = useState<LifecycleSettings | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    const [t, s, cfg] = await Promise.all([
      fetch("/api/lifecycle/templates").then((r) => r.json()),
      fetch("/api/lifecycle/sequences").then((r) => r.json()),
      fetch("/api/lifecycle/settings").then((r) => r.json()),
    ]);
    if (t.success) setTemplates(t.data);
    if (s.success) setSequences(s.data);
    if (cfg.success) setSettings(cfg.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return (
    <div>
      <TopBar
        title="Automations"
        subtitle="Client and contractor lifecycle: sequences, templates, timings"
      />
      <div className="px-4 lg:px-6 space-y-4 pb-8">
        {settings && !settings.liveEmails && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
            <p className="text-xs text-yellow-400">
              Safe mode: live client emails are OFF. Sequences run as dry runs — everything is recorded
              on timelines, nothing reaches a real inbox. Flip the switch in Settings when ready.
            </p>
          </div>
        )}

        <div className="flex gap-1 bg-bb-surface border border-bb-border rounded-lg p-1 overflow-x-auto w-full sm:w-auto sm:inline-flex">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap",
                tab === t.key ? "bg-bb-elevated text-white" : "text-bb-dim hover:text-bb-muted"
              )}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-bb-dim">Loading…</p>
        ) : (
          <>
            {tab === "templates" && (
              <div className="space-y-2">
                {templates.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setEditing(t.key)}
                    className="w-full flex items-center gap-3 bg-bb-surface border border-bb-border hover:border-bb-orange/50 rounded-lg p-3 text-left transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{t.name}</span>
                        <Badge variant={KIND_BADGE[t.kind]?.variant || "gray"}>
                          {KIND_BADGE[t.kind]?.label || t.kind}
                        </Badge>
                      </div>
                      <p className="text-xs text-bb-dim truncate mt-0.5">Subject: {t.subject}</p>
                      <p className="text-xs text-bb-dim/70 truncate">Used by: {t.trigger}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-bb-dim">
                        {t.updatedBy ? `${t.updatedBy} · ` : ""}
                        {fmtDateTime(t.updatedAt)}
                      </p>
                      <Pencil size={13} className="text-bb-dim inline-block mt-1" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {tab === "sequences" && settings && (
              <SequencesTab sequences={sequences} isOwner={settings.isOwner} onChanged={loadAll} />
            )}

            {tab === "dry-run" && <DryRunTab />}

            {tab === "settings" && settings && (
              <SettingsTab settings={settings} onChanged={loadAll} />
            )}
          </>
        )}
      </div>

      {editing && (
        <TemplateEditor templateKey={editing} onClose={() => setEditing(null)} onSaved={loadAll} />
      )}
    </div>
  );
}
