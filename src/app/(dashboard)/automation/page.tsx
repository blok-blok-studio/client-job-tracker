"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Zap, ZapOff, Trash2, Edit3, BarChart3, Instagram, MessageSquare } from "lucide-react";
import Link from "next/link";
import TopBar from "@/components/layout/TopBar";
import Badge from "@/components/shared/Badge";

interface AutomationFlow {
  id: string;
  clientId: string;
  client: { id: string; name: string };
  name: string;
  description: string | null;
  platform: string;
  trigger: string;
  active: boolean;
  _count: { executions: number };
  createdAt: string;
  updatedAt: string;
}

interface Client {
  id: string;
  name: string;
}

const PLATFORMS = ["INSTAGRAM", "FACEBOOK", "THREADS"];
const TRIGGERS = [
  { value: "KEYWORD", label: "Keyword Match" },
  { value: "COMMENT", label: "Comment Trigger" },
  { value: "STORY_REPLY", label: "Story Reply" },
  { value: "NEW_FOLLOWER", label: "New Follower" },
  { value: "MANUAL", label: "Manual" },
];

export default function AutomationPage() {
  const [flows, setFlows] = useState<AutomationFlow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", clientId: "", platform: "INSTAGRAM", trigger: "KEYWORD", description: "" });
  const [creating, setCreating] = useState(false);

  const fetchFlows = useCallback(async () => {
    const res = await fetch("/api/automations");
    const data = await res.json();
    if (data.success) setFlows(data.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFlows();
    fetch("/api/clients").then((r) => r.json()).then((d) => {
      if (d.success) setClients(d.data);
    });
  }, [fetchFlows]);

  const handleCreate = async () => {
    if (!createForm.name || !createForm.clientId) return;
    setCreating(true);
    const res = await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    });
    const data = await res.json();
    if (data.success) {
      setShowCreate(false);
      setCreateForm({ name: "", clientId: "", platform: "INSTAGRAM", trigger: "KEYWORD", description: "" });
      fetchFlows();
    }
    setCreating(false);
  };

  const toggleActive = async (id: string, active: boolean) => {
    await fetch(`/api/automations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    fetchFlows();
  };

  const deleteFlow = async (id: string) => {
    if (!confirm("Delete this automation flow? This cannot be undone.")) return;
    await fetch(`/api/automations/${id}`, { method: "DELETE" });
    fetchFlows();
  };

  return (
    <>
      <TopBar title="DM Automations" subtitle="Visual flow builder for Instagram, Facebook & Threads DMs" />
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">{flows.length} Automation{flows.length !== 1 ? "s" : ""}</h2>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-sm font-medium rounded-lg hover:opacity-90"
          >
            <Plus size={16} />
            New Flow
          </button>
        </div>

        {/* Create Form */}
        {showCreate && (
          <div className="bg-bb-surface border border-bb-border rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">Create New Automation</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                placeholder="Flow name (e.g., Lead Qualifier)"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className="bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-white text-sm"
              />
              <select
                value={createForm.clientId}
                onChange={(e) => setCreateForm({ ...createForm, clientId: e.target.value })}
                className="bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-white text-sm"
              >
                <option value="">Select client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                value={createForm.platform}
                onChange={(e) => setCreateForm({ ...createForm, platform: e.target.value })}
                className="bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-white text-sm"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <select
                value={createForm.trigger}
                onChange={(e) => setCreateForm({ ...createForm, trigger: e.target.value })}
                className="bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-white text-sm"
              >
                {TRIGGERS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <textarea
              placeholder="Description (optional)"
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-white text-sm resize-none"
              rows={2}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-bb-dim hover:text-white">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={creating || !createForm.name || !createForm.clientId}
                className="px-4 py-2 bg-bb-orange text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Flow"}
              </button>
            </div>
          </div>
        )}

        {/* Flow List */}
        {loading ? (
          <div className="text-center py-12 text-bb-dim">Loading...</div>
        ) : flows.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare size={48} className="text-bb-dim mx-auto mb-4" />
            <p className="text-bb-muted">No automation flows yet</p>
            <p className="text-sm text-bb-dim mt-1">Create your first DM automation flow to start converting leads.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {flows.map((flow) => (
              <div
                key={flow.id}
                className="bg-bb-surface border border-bb-border rounded-xl p-4 hover:border-bb-orange/30 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        href={`/automation/${flow.id}`}
                        className="text-white font-semibold hover:text-bb-orange transition-colors"
                      >
                        {flow.name}
                      </Link>
                      <Badge variant={flow.active ? "green" : "gray"} size="sm">
                        {flow.active ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="blue" size="sm">{flow.platform}</Badge>
                      <Badge variant="purple" size="sm">{flow.trigger}</Badge>
                    </div>
                    {flow.description && (
                      <p className="text-xs text-bb-dim mb-2">{flow.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-bb-dim">
                      <span>{flow.client.name}</span>
                      <span>{flow._count.executions} execution{flow._count.executions !== 1 ? "s" : ""}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleActive(flow.id, flow.active)}
                      className={`p-2 rounded-lg transition-colors ${flow.active ? "text-green-400 hover:bg-green-500/10" : "text-bb-dim hover:bg-bb-elevated"}`}
                      title={flow.active ? "Deactivate" : "Activate"}
                    >
                      {flow.active ? <Zap size={16} /> : <ZapOff size={16} />}
                    </button>
                    <Link
                      href={`/automation/${flow.id}`}
                      className="p-2 text-bb-dim hover:text-white hover:bg-bb-elevated rounded-lg transition-colors"
                      title="Edit flow"
                    >
                      <Edit3 size={16} />
                    </Link>
                    <button
                      onClick={() => deleteFlow(flow.id)}
                      className="p-2 text-bb-dim hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
