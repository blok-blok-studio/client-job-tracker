"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Save, Zap, ZapOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { nodeTypes } from "@/components/automation/nodes";
import NodePalette from "@/components/automation/NodePalette";
import NodeConfigPanel from "@/components/automation/NodeConfigPanel";

interface FlowData {
  id: string;
  name: string;
  description: string | null;
  platform: string;
  trigger: string;
  triggerConfig: Record<string, unknown> | null;
  nodes: Node[];
  edges: Edge[];
  active: boolean;
  client: { id: string; name: string };
}

export default function FlowEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [flow, setFlow] = useState<FlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  // Fetch flow
  useEffect(() => {
    fetch(`/api/automations/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setFlow(d.data);
          setNodes((d.data.nodes as Node[]) || []);
          setEdges((d.data.edges as Edge[]) || []);
        }
      })
      .finally(() => setLoading(false));
  }, [id, setNodes, setEdges]);

  // Handle new connections
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            animated: true,
            style: { stroke: "#f97316", strokeWidth: 2 },
          },
          eds
        )
      );
    },
    [setEdges]
  );

  // Handle node click (open config panel)
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  // Add new node from palette
  const handleAddNode = useCallback(
    (type: string) => {
      const newNode: Node = {
        id: `${type}_${Date.now()}`,
        type,
        position: { x: 250 + Math.random() * 200, y: 100 + nodes.length * 120 },
        data: getDefaultData(type),
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [nodes.length, setNodes]
  );

  // Update node data from config panel
  const handleUpdateNode = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n))
      );
      setSelectedNode((prev) => (prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...data } } : prev));
    },
    [setNodes]
  );

  // Save flow
  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/automations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes, edges }),
    });
    setSaving(false);
  };

  // Toggle active
  const handleToggle = async () => {
    if (!flow) return;
    await fetch(`/api/automations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !flow.active }),
    });
    setFlow({ ...flow, active: !flow.active });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 text-bb-dim animate-spin" />
      </div>
    );
  }

  if (!flow) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-bb-dim">Flow not found</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-bb-black">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-bb-border bg-bb-surface">
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
            onClick={handleSave}
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
        {/* Node Palette */}
        <NodePalette onAddNode={handleAddNode} />

        {/* Flow Canvas */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            defaultEdgeOptions={{
              animated: true,
              style: { stroke: "#f97316", strokeWidth: 2 },
            }}
            style={{ background: "#0A0A0C" }}
          >
            <Controls
              style={{ background: "#1a1a1e", borderColor: "#2a2a2e", borderRadius: 8 }}
            />
            <MiniMap
              style={{ background: "#1a1a1e", borderColor: "#2a2a2e" }}
              nodeColor="#f97316"
              maskColor="rgba(0,0,0,0.7)"
            />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#ffffff08" />
          </ReactFlow>
        </div>

        {/* Config Panel */}
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode as { id: string; type: string; data: Record<string, unknown> }}
            onUpdate={handleUpdateNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}

function getDefaultData(type: string): Record<string, unknown> {
  switch (type) {
    case "trigger":
      return { label: "When message received", keywords: [], matchType: "contains" };
    case "message":
      return { text: "", mediaUrl: "" };
    case "ai_response":
      return { systemPrompt: "", maxTokens: 300 };
    case "condition":
      return { field: "lastMessage", operator: "contains", value: "" };
    case "quick_reply":
      return { text: "Choose an option:", options: [{ label: "Option 1", value: "option_1" }, { label: "Option 2", value: "option_2" }] };
    case "delay":
      return { duration: 5, unit: "seconds" };
    case "tag":
      return { tagName: "" };
    case "notify":
      return { channel: "telegram", message: "" };
    case "set_variable":
      return { variableName: "", variableValue: "" };
    case "goto":
      return { label: "Jump" };
    case "end":
      return {};
    default:
      return {};
  }
}
