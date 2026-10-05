import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { GraphNode } from "@ha-lens/model";
import type { GraphEntityIcon } from "./AutomationGraph";
import type { DiffStatus } from "./automationDiff";

type LensNodeData = GraphNode & {
  runtimeBadge?: string;
  runtimeBadgeTone?: "good" | "partial" | "neutral";
  entityIcons?: GraphEntityIcon[];
  diffStatus?: DiffStatus;
};

function NodeEntityIcons({ icons }: { icons: GraphEntityIcon[] }) {
  if (!icons.length) return null;
  const visible = icons.slice(0, 2);
  const hidden = Math.max(0, icons.length - visible.length);

  return (
    <span className="lens-node__entity-icons" aria-label={icons.map((icon) => icon.label).join(", ")}>
      {visible.map((icon) => (
        <span
          key={icon.entityId}
          className="lens-node__entity-icon"
          title={icon.icon ? `${icon.label} · ${icon.icon}` : icon.label}
        >
          <svg viewBox={icon.viewBox || "0 0 24 24"} aria-hidden="true">
            <path d={icon.path} />
            {icon.secondaryPath && <path className="lens-node__entity-icon-secondary" d={icon.secondaryPath} />}
          </svg>
        </span>
      ))}
      {hidden > 0 && <span className="lens-node__entity-icon-more">+{hidden}</span>}
    </span>
  );
}

export function LensNode({ data, selected }: NodeProps) {
  const node = data as unknown as LensNodeData;
  const entityIcons = node.entityIcons ?? [];

  return (
    <div className={`lens-node lens-node--${node.kind} ${node.disabled ? "is-disabled" : ""} ${selected ? "is-selected" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <div className="lens-node__topline">
        <div className="lens-node__kind-row">
          <div className="lens-node__kind">{node.kind}</div>
          <NodeEntityIcons icons={entityIcons} />
        </div>
        <div className="lens-node__badges">
          {node.disabled && <div className="lens-node__disabled-badge">disabled</div>}
          {node.diffStatus && (
            <div className={`lens-node__diff-badge lens-node__diff-badge--${node.diffStatus}`}>
              {node.diffStatus === "added" ? "+ added" : node.diffStatus === "removed" ? "− removed" : "~ changed"}
            </div>
          )}
          {node.runtimeBadge && (
            <div
              className={`lens-node__runtime-badge lens-node__runtime-badge--${node.runtimeBadgeTone || "neutral"}`}
              title="Observed in the latest Home Assistant run"
            >
              {node.runtimeBadge}
            </div>
          )}
        </div>
      </div>
      <div className="lens-node__label">{node.label}</div>
      {node.subtitle && <div className="lens-node__subtitle">{node.subtitle}</div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
