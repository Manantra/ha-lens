import { useEffect, useMemo, useRef, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node, type ReactFlowInstance } from "@xyflow/react";
import type { AutomationGraph as AutomationGraphModel } from "@ha-lens/model";
import { LensNode } from "./LensNode";
import { layoutGraph } from "./layout";

const nodeTypes = { lens: LensNode };

export interface TraceNodeBadge {
  label: string;
  tone?: "good" | "partial" | "neutral";
}

export function AutomationGraph({
  graph,
  highlightedNodeIds,
  traceNodeIds,
  traceEdgeIds,
  traceNotTakenEdgeIds,
  traceNodeBadges,
  traceCoverageActive = false,
  focusNodeIds,
  refitKey,
  fitMode = "all",
}: {
  graph: AutomationGraphModel;
  highlightedNodeIds: Set<string>;
  traceNodeIds: Set<string>;
  traceEdgeIds?: Set<string>;
  traceNotTakenEdgeIds?: Set<string>;
  traceNodeBadges?: Map<string, TraceNodeBadge>;
  traceCoverageActive?: boolean;
  focusNodeIds?: Set<string>;
  refitKey?: boolean;
  fitMode?: "all" | "width";
}) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [flow, setFlow] = useState<ReactFlowInstance<Node, Edge> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const structuralNodeIds = useMemo(
    () => new Set(
      graph.nodes
        .filter((node) => node.kind === "merge" || node.kind === "end")
        .map((node) => node.id),
    ),
    [graph],
  );

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
    () => nodes.map((node) => {
      const executed = traceCoverageActive && traceNodeIds.has(node.id);
      const notReached = traceCoverageActive
        && !executed
        && !structuralNodeIds.has(node.id);

      const runtimeBadge = traceCoverageActive ? traceNodeBadges?.get(node.id) : undefined;

      return {
        ...node,
        data: {
          ...node.data,
          runtimeBadge: runtimeBadge?.label,
          runtimeBadgeTone: runtimeBadge?.tone,
        },
        className: [
          highlightedNodeIds.size && !highlightedNodeIds.has(node.id) ? "is-dimmed" : "",
          executed ? "is-traced is-run-executed" : "",
          notReached ? "is-run-not-reached" : "",
        ].filter(Boolean).join(" "),
      };
    }),
    [nodes, highlightedNodeIds, structuralNodeIds, traceCoverageActive, traceNodeBadges, traceNodeIds],
  );
  const displayEdges = useMemo(
    () => edges.map((edge) => {
      const executed = traceCoverageActive && Boolean(traceEdgeIds?.has(edge.id));
      const notTaken = traceCoverageActive && Boolean(traceNotTakenEdgeIds?.has(edge.id));
      const notReached = traceCoverageActive && !executed && !notTaken;

      return {
        ...edge,
        className: [
          highlightedNodeIds.size && !(highlightedNodeIds.has(edge.source) && highlightedNodeIds.has(edge.target)) ? "is-dimmed" : "",
          executed ? "is-traced is-run-executed" : "",
          notTaken ? "is-run-not-taken" : "",
          notReached ? "is-run-not-reached" : "",
        ].filter(Boolean).join(" "),
      };
    }),
    [edges, highlightedNodeIds, traceCoverageActive, traceEdgeIds, traceNotTakenEdgeIds],
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
