import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { GraphNode } from "@ha-lens/model";
import type { GraphEntityIcon } from "./AutomationGraph";
import type { DiffStatus } from "./automationDiff";
import { localizeGeneratedGraphLabel, localizeGeneratedGraphSubtitle, translate, type Language } from "./i18n";

type LensNodeData = GraphNode & {
  runtimeBadge?: string;
  runtimeBadgeTone?: "good" | "partial" | "neutral";
  entityIcons?: GraphEntityIcon[];
  diffStatus?: DiffStatus;
  language?: Language;
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
  const t = (key: string) => translate(key, node.language || "en");

  return (
    <div className={`lens-node lens-node--${node.kind} ${node.disabled ? "is-disabled" : ""} ${node.dynamicEnabled ? "is-dynamic-enabled" : ""} ${selected ? "is-selected" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <div className="lens-node__topline">
        <div className="lens-node__kind-row">
          <div className="lens-node__kind" title={t(node.kind)}>{t(node.kind)}</div>
          <NodeEntityIcons icons={entityIcons} />
        </div>
        <div className="lens-node__badges">
          {node.disabled && <div className="lens-node__disabled-badge" title={t("disabled")}>{t("disabled")}</div>}
          {!node.disabled && node.dynamicEnabled && <div className="lens-node__dynamic-enabled-badge" title={t("runtime enabled")}>{t("runtime enabled")}</div>}
          {node.diffStatus && (
            <div className={`lens-node__diff-badge lens-node__diff-badge--${node.diffStatus}`}>
              {node.diffStatus === "added" ? "+ " + t("Added") : node.diffStatus === "removed" ? "− " + t("Removed") : "~ " + t("Changed")}
            </div>
          )}
          {node.runtimeBadge && (
            <div
              className={`lens-node__runtime-badge lens-node__runtime-badge--${node.runtimeBadgeTone || "neutral"}`}
              title={t("Observed in the latest Home Assistant run")}
            >
              {node.runtimeBadge}
            </div>
          )}
        </div>
      </div>
      <div className="lens-node__label" title={node.generatedLabel ? localizeGeneratedGraphLabel(node.label, node.language || "en") : node.label}>{node.generatedLabel ? localizeGeneratedGraphLabel(node.label, node.language || "en") : node.label}</div>
      {node.subtitle && <div className="lens-node__subtitle">{localizeGeneratedGraphSubtitle(node.subtitle, node.language || "en")}</div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
