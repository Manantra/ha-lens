import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { GraphNode } from "@ha-lens/model";

type LensNodeData = GraphNode & {
  runtimeBadge?: string;
  runtimeBadgeTone?: "good" | "partial" | "neutral";
};

export function LensNode({ data, selected }: NodeProps) {
  const node = data as unknown as LensNodeData;
  return (
    <div className={`lens-node lens-node--${node.kind} ${selected ? "is-selected" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <div className="lens-node__topline">
        <div className="lens-node__kind">{node.kind}</div>
        {node.runtimeBadge && (
          <div
            className={`lens-node__runtime-badge lens-node__runtime-badge--${node.runtimeBadgeTone || "neutral"}`}
            title="Observed in the latest Home Assistant run"
          >
            {node.runtimeBadge}
          </div>
        )}
      </div>
      <div className="lens-node__label">{node.label}</div>
      {node.subtitle && <div className="lens-node__subtitle">{node.subtitle}</div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
