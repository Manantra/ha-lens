import { useEffect, useMemo, useRef, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node, type ReactFlowInstance } from "@xyflow/react";
import type { AutomationGraph as AutomationGraphModel } from "@ha-lens/model";
import { LensNode } from "./LensNode";
import { layoutGraph } from "./layout";

const nodeTypes = { lens: LensNode };

export function AutomationGraph({
  graph,
  highlightedNodeIds,
  traceNodeIds,
  traceEdgeIds,
  focusNodeIds,
  refitKey,
  fitMode = "all",
}: {
  graph: AutomationGraphModel;
  highlightedNodeIds: Set<string>;
  traceNodeIds: Set<string>;
  traceEdgeIds?: Set<string>;
  focusNodeIds?: Set<string>;
  refitKey?: boolean;
  fitMode?: "all" | "width";
}) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [flow, setFlow] = useState<ReactFlowInstance<Node, Edge> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
    // Wait briefly so viewport calculations see the settled canvas size.
    const timer = window.setTimeout(() => {
      if (fitMode === "width") {
        const container = containerRef.current;
        if (!container) return;

        const bounds = flow.getNodesBounds(nodes.map((node) => node.id));
        if (bounds.width <= 0) return;

        const rect = container.getBoundingClientRect();
        const horizontalPadding = 32;
        const topPadding = 28;
        const usableWidth = Math.max(1, rect.width - horizontalPadding * 2);
        const zoom = Math.min(1.35, Math.max(0.2, usableWidth / bounds.width));
        const x = (rect.width - bounds.width * zoom) / 2 - bounds.x * zoom;
        const y = topPadding - bounds.y * zoom;

        void flow.setViewport({ x, y, zoom }, { duration: 260 });
        return;
      }

      void flow.fitView({
        nodes,
        padding: 0.18,
        duration: 260,
        minZoom: 0.2,
        maxZoom: 1.35,
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [fitMode, flow, focusNodeIds, nodes, refitKey]);

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
        (traceEdgeIds?.has(edge.id) || (traceNodeIds.has(edge.source) && traceNodeIds.has(edge.target))) ? "is-traced" : "",
      ].filter(Boolean).join(" "),
    })),
    [edges, highlightedNodeIds, traceEdgeIds, traceNodeIds],
  );

  return (
    <div ref={containerRef} className="automation-graph" data-export-graph>
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
