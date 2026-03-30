"use client";

import { useCallback, useEffect } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
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
import { nodeTypes } from "./nodes";

interface FlowCanvasProps {
  initialNodes: unknown[];
  initialEdges: unknown[];
  onNodesChange: (nodes: unknown[]) => void;
  onEdgesChange: (edges: unknown[]) => void;
  onNodeSelect: (node: { id: string; type: string; data: Record<string, unknown> } | null) => void;
  onNodeUpdate: (nodeId: string, data: Record<string, unknown>) => void;
}

function getDefaultData(type: string): Record<string, unknown> {
  switch (type) {
    case "trigger": return { label: "When message received", keywords: [], matchType: "contains" };
    case "message": return { text: "", mediaUrl: "" };
    case "ai_response": return { systemPrompt: "", maxTokens: 300 };
    case "condition": return { field: "lastMessage", operator: "contains", value: "" };
    case "quick_reply": return { text: "Choose an option:", options: [{ label: "Option 1", value: "option_1" }, { label: "Option 2", value: "option_2" }] };
    case "delay": return { duration: 5, unit: "seconds" };
    case "tag": return { tagName: "" };
    case "notify": return { channel: "telegram", message: "" };
    case "set_variable": return { variableName: "", variableValue: "" };
    case "goto": return { label: "Jump" };
    case "end": return {};
    default: return {};
  }
}

function FlowCanvasInner({ initialNodes, initialEdges, onNodesChange: onNodesExtChange, onEdgesChange: onEdgesExtChange, onNodeSelect }: FlowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges as Edge[]);

  // Sync nodes/edges back to parent
  useEffect(() => { onNodesExtChange(nodes); }, [nodes, onNodesExtChange]);
  useEffect(() => { onEdgesExtChange(edges); }, [edges, onEdgesExtChange]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge({ ...connection, animated: true, style: { stroke: "#f97316", strokeWidth: 2 } }, eds)
      );
    },
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onNodeSelect({ id: node.id, type: node.type || "message", data: node.data as Record<string, unknown> });
  }, [onNodeSelect]);

  // Listen for addNode events from palette
  useEffect(() => {
    const handler = (e: Event) => {
      const { type } = (e as CustomEvent).detail;
      const newNode: Node = {
        id: `${type}_${Date.now()}`,
        type,
        position: { x: 250 + Math.random() * 200, y: 100 + nodes.length * 120 },
        data: getDefaultData(type),
      };
      setNodes((nds) => [...nds, newNode]);
    };
    window.addEventListener("addNode", handler);
    return () => window.removeEventListener("addNode", handler);
  }, [nodes.length, setNodes]);

  // Listen for updateNode events from config panel
  useEffect(() => {
    const handler = (e: Event) => {
      const { nodeId, data } = (e as CustomEvent).detail;
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n))
      );
    };
    window.addEventListener("updateNode", handler);
    return () => window.removeEventListener("updateNode", handler);
  }, [setNodes]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onPaneClick={() => onNodeSelect(null)}
      nodeTypes={nodeTypes}
      fitView
      defaultEdgeOptions={{
        animated: true,
        style: { stroke: "#f97316", strokeWidth: 2 },
      }}
      style={{ background: "#0A0A0C" }}
    >
      <Controls style={{ background: "#1a1a1e", borderColor: "#2a2a2e", borderRadius: 8 }} />
      <MiniMap
        style={{ background: "#1a1a1e", borderColor: "#2a2a2e" }}
        nodeColor="#f97316"
        maskColor="rgba(0,0,0,0.7)"
      />
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#ffffff08" />
    </ReactFlow>
  );
}

export default function FlowCanvas(props: FlowCanvasProps) {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlowProvider>
        <FlowCanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
