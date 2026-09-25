import { useEffect, useMemo, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import type { AutomationGraph as AutomationGraphModel } from "@ha-lens/model";
import { LensNode } from "./LensNode";
import { layoutGraph } from "./layout";

const nodeTypes = { lens: LensNode };

export function AutomationGraph({ graph, highlightedNodeIds }: { graph: AutomationGraphModel; highlightedNodeIds: Set<string> }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

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

  const displayNodes = useMemo(
    () => nodes.map((node) => ({ ...node, className: highlightedNodeIds.size && !highlightedNodeIds.has(node.id) ? "is-dimmed" : "" })),
    [nodes, highlightedNodeIds],
  );
  const displayEdges = useMemo(
    () => edges.map((edge) => ({
      ...edge,
      className: highlightedNodeIds.size && !(highlightedNodeIds.has(edge.source) && highlightedNodeIds.has(edge.target)) ? "is-dimmed" : "",
    })),
    [edges, highlightedNodeIds],
  );

  return (
    <div className="automation-graph" data-export-graph>
      <ReactFlow nodes={displayNodes} edges={displayEdges} nodeTypes={nodeTypes} fitView minZoom={0.15} maxZoom={1.8}>
        <Background gap={24} size={1} />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
    </div>
  );
}
