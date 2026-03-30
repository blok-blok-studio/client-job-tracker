"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, Save, Zap, ZapOff, Loader2 } from "lucide-react";
import Link from "next/link";
import NodePalette from "@/components/automation/NodePalette";
import NodeConfigPanel from "@/components/automation/NodeConfigPanel";

// Dynamic import to avoid SSR issues with reactflow
const FlowCanvas = dynamic(() => import("@/components/automation/FlowCanvas"), { ssr: false });

interface FlowData {
  id: string;
  name: string;
  description: string | null;
  platform: string;
  trigger: string;
  triggerConfig: Record<string, unknown> | null;
  nodes: unknown[];
  edges: unknown[];
  active: boolean;
  client: { id: string; name: string };
}

export default function FlowEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [flow, setFlow] = useState<FlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedNode, setSelectedNode] = useState<{ id: string; type: string; data: Record<string, unknown> } | null>(null);
  const [flowNodes, setFlowNodes] = useState<unknown[]>([]);
  const [flowEdges, setFlowEdges] = useState<unknown[]>([]);

  useEffect(() => {
    fetch(`/api/automations/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setFlow(d.data);
          setFlowNodes(d.data.nodes || []);
          setFlowEdges(d.data.edges || []);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async (nodes: unknown[], edges: unknown[]) => {
    setSaving(true);
    await fetch(`/api/automations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes, edges }),
    });
    setSaving(false);
  };

  const handleToggle = async () => {
    if (!flow) return;
    await fetch(`/api/automations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !flow.active }),
    });
    setFlow({ ...flow, active: !flow.active });
  };

  const handleNodeSelect = useCallback((node: { id: string; type: string; data: Record<string, unknown> } | null) => {
    setSelectedNode(node);
  }, []);

  const handleNodeUpdate = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setSelectedNode((prev) => (prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...data } } : prev));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <Loader2 className="w-8 h-8 text-bb-dim animate-spin" />
      </div>
    );
  }

  if (!flow) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <p className="text-bb-dim">Flow not found</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-48px)] flex flex-col bg-bb-black -mt-2">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-bb-border bg-bb-surface shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/automation" className="text-bb-dim hover:text-white">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-sm font-semibold text-white">{flow.name}</h1>
            <p className="text-[10px] text-bb-dim">{flow.client.name} &middot; {flow.platform}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggle}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              flow.active
                ? "bg-green-500/10 text-green-400 border border-green-500/30"
                : "bg-bb-elevated text-bb-dim border border-bb-border"
            }`}
          >
            {flow.active ? <Zap size={12} /> : <ZapOff size={12} />}
            {flow.active ? "Active" : "Inactive"}
          </button>
          <button
            onClick={() => handleSave(flowNodes, flowEdges)}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-bb-orange text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 flex overflow-hidden">
        <NodePalette onAddNode={(type) => {
          // Handled inside FlowCanvas
          const event = new CustomEvent("addNode", { detail: { type } });
          window.dispatchEvent(event);
        }} />

        <div className="flex-1 relative">
          <FlowCanvas
            initialNodes={flowNodes}
            initialEdges={flowEdges}
            onNodesChange={setFlowNodes}
            onEdgesChange={setFlowEdges}
            onNodeSelect={handleNodeSelect}
            onNodeUpdate={handleNodeUpdate}
          />
        </div>

        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onUpdate={(nodeId, data) => {
              handleNodeUpdate(nodeId, data);
              const event = new CustomEvent("updateNode", { detail: { nodeId, data } });
              window.dispatchEvent(event);
            }}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}
