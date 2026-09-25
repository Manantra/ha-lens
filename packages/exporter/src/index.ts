import type { AutomationGraph } from "@ha-lens/model";

const escapeLabel = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");

const mermaidId = (value: string): string =>
  `n_${value.replace(/[^a-zA-Z0-9_]/g, "_")}`;

const shapeFor = (kind: string, label: string): string => {
  const text = `"${escapeLabel(label)}"`;
  if (kind === "condition" || kind === "control") return `{${text}}`;
  if (kind === "trigger") return `([${text}])`;
  if (kind === "stop" || kind === "end") return `((${text}))`;
  if (kind === "loop") return `{{${text}}}`;
  return `[${text}]`;
};

export function automationGraphToMermaid(graph: AutomationGraph, title?: string): string {
  const lines = ["flowchart TD"];
  if (title) lines.push(`  %% ${title.replace(/\n/g, " ")}`);

  for (const node of graph.nodes) {
    const label = node.subtitle ? `${node.label}\\n${node.subtitle}` : node.label;
    lines.push(`  ${mermaidId(node.id)}${shapeFor(node.kind, label)}`);
  }

  for (const edge of graph.edges) {
    const edgeLabel = edge.label ? `|"${escapeLabel(edge.label)}"|` : "";
    lines.push(`  ${mermaidId(edge.source)} -->${edgeLabel} ${mermaidId(edge.target)}`);
  }

  return lines.join("\n");
}
