import { useEffect, useMemo, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node, type ReactFlowInstance } from "@xyflow/react";
import type { AutomationGraph as AutomationGraphModel } from "@ha-lens/model";
import { LensNode } from "./LensNode";
import { layoutGraph } from "./layout";

const nodeTypes = { lens: LensNode };

export function AutomationGraph({
  graph,
  highlightedNodeIds,
  traceNodeIds,
  focusNodeIds,
  refitKey,
}: {
  graph: AutomationGraphModel;
  highlightedNodeIds: Set<string>;
  traceNodeIds: Set<string>;
  focusNodeIds?: Set<string>;
  refitKey?: boolean;
}) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [flow, setFlow] = useState<ReactFlowInstance<Node, Edge> | null>(null);

  useEffect(() => {
    let cancelled = false;
    layoutGraph(graph).then((layout) => {
      if (cancelled) return;
      setNodes(layout.nodes);
      setEdges(layout.edges);
    });
    return () => {
      cancelled = true;
    };
  }, [graph]);

  useEffect(() => {
    if (!flow || !nodes.length) return;

    // React Flow updates its viewport dimensions through ResizeObserver.
    // Wait briefly so fitView sees the new canvas width after panels are shown/hidden.
    const timer = window.setTimeout(() => {
      void flow.fitView({
        nodes,
        padding: 0.18,
        duration: 260,
        minZoom: 0.2,
        maxZoom: 1.35,
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [flow, focusNodeIds, nodes, refitKey]);

  const displayNodes = useMemo(
    () => nodes.map((node) => ({
      ...node,
      className: [
        highlightedNodeIds.size && !highlightedNodeIds.has(node.id) ? "is-dimmed" : "",
        traceNodeIds.has(node.id) ? "is-traced" : "",
      ].filter(Boolean).join(" "),
    })),
    [nodes, highlightedNodeIds, traceNodeIds],
  );
  const displayEdges = useMemo(
    () => edges.map((edge) => ({
      ...edge,
      className: [
        highlightedNodeIds.size && !(highlightedNodeIds.has(edge.source) && highlightedNodeIds.has(edge.target)) ? "is-dimmed" : "",
        traceNodeIds.has(edge.source) && traceNodeIds.has(edge.target) ? "is-traced" : "",
      ].filter(Boolean).join(" "),
    })),
    [edges, highlightedNodeIds, traceNodeIds],
  );

  return (
    <div className="automation-graph" data-export-graph>
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        onInit={setFlow}
        minZoom={0.15}
        maxZoom={1.8}
      >
        <Background gap={24} size={1} />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
    </div>
  );
}
