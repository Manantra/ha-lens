import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { GraphNode } from "@ha-lens/model";

export function LensNode({ data, selected }: NodeProps) {
  const node = data as unknown as GraphNode;
  return (
    <div className={`lens-node lens-node--${node.kind} ${selected ? "is-selected" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <div className="lens-node__kind">{node.kind}</div>
      <div className="lens-node__label">{node.label}</div>
      {node.subtitle && <div className="lens-node__subtitle">{node.subtitle}</div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
