import ELK from "elkjs/lib/elk.bundled.js";
import type { Edge, Node } from "@xyflow/react";
import type { AutomationGraph } from "@ha-lens/model";

const elk = new ELK();
const WIDTH = 250;
const HEIGHT = 88;

export async function layoutGraph(graph: AutomationGraph): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const result = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "48",
      "elk.layered.spacing.nodeNodeBetweenLayers": "70",
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: graph.nodes.map((node) => ({ id: node.id, width: WIDTH, height: HEIGHT })),
    edges: graph.edges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  });

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodes: Node[] = (result.children ?? []).map((item) => {
    const source = nodeById.get(item.id)!;
    return {
      id: item.id,
      position: { x: item.x ?? 0, y: item.y ?? 0 },
      data: { ...source },
      type: "lens",
    };
  });

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: "smoothstep",
    animated: false,
  }));

  return { nodes, edges };
}
