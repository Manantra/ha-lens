import type {
  AutomationGraph,
  AutomationModel,
  ConditionNode,
  SequenceItem,
} from "@ha-lens/model";

export interface TraceStepLike {
  path: string;
  result?: unknown;
}

function rootNormalizedSegments(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return [];

  if (parts[0] === "trigger") parts[0] = "triggers";
  else if (parts[0] === "condition") parts[0] = "conditions";
  else if (parts[0] === "action") parts[0] = "actions";

  return parts;
}

export function canonicalTraceSegments(path: string): string[] {
  const parts = rootNormalizedSegments(path);
  const output: string[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];

    // Home Assistant traces if-conditions under if/condition/<index>,
    // while HA Lens semantic condition IDs use if.<index>.
    if (part === "if" && parts[index + 1] === "condition") {
      output.push(part);
      index += 1;
      continue;
    }

    // Home Assistant traces each parallel branch as
    // parallel/<branch>/sequence/<step>. HA Lens stores branch steps as
    // parallel.<branch>.<step>.
    if (
      part === "parallel"
      && /^\d+$/.test(parts[index + 1] ?? "")
      && parts[index + 2] === "sequence"
    ) {
      output.push(part, parts[index + 1]);
      index += 2;
      continue;
    }

    output.push(part);
  }

  return output;
}

function candidateIds(parts: string[]): string[] {
  const output: string[] = [];
  for (let end = parts.length; end > 0; end -= 1) {
    output.push(parts.slice(0, end).join("."));
  }
  return output;
}

function inlineConditionVariants(parts: string[]): string[][] {
  const variants: string[][] = [];
  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index] !== "conditions") continue;

    const variant = [...parts];
    variant.splice(index, 0, "condition");
    variants.push(variant);
  }
  return variants;
}

function traceCandidates(path: string): string[] {
  const canonical = canonicalTraceSegments(path);
  const rootOnly = rootNormalizedSegments(path);
  const variants = [
    canonical,
    ...inlineConditionVariants(canonical),
    rootOnly,
    ...inlineConditionVariants(rootOnly),
  ];
  return [...new Set(variants.flatMap(candidateIds))]
    .sort((left, right) => right.split(".").length - left.split(".").length);
}

function resolveTracePath(path: string, ids: Iterable<string>): string | null {
  const available = new Set(ids);
  for (const candidate of traceCandidates(path)) {
    if (available.has(candidate)) return candidate;
  }
  return null;
}

export function tracePathToNodeId(path: string, nodeIds: Iterable<string>): string | null {
  return resolveTracePath(path, nodeIds);
}

export function tracePathToSemanticId(path: string, semanticIds: Iterable<string>): string | null {
  return resolveTracePath(path, semanticIds);
}

export function traceNodeIds(paths: string[], nodeIds: Iterable<string>): Set<string> {
  const available = [...nodeIds];
  const output = new Set<string>();
  for (const path of paths) {
    const nodeId = tracePathToNodeId(path, available);
    if (nodeId) output.add(nodeId);
  }
  return output;
}

function addConditionLabels(condition: ConditionNode, labels: Map<string, string>) {
  labels.set(condition.id, condition.alias || condition.summary);
  condition.children?.forEach((child) => addConditionLabels(child, labels));
}

function addSequenceLabels(items: SequenceItem[], labels: Map<string, string>) {
  for (const item of items) {
    labels.set(item.id, item.alias || item.summary);

    if (item.kind === "if") {
      item.conditions.forEach((condition) => addConditionLabels(condition, labels));
      addSequenceLabels(item.then, labels);
      addSequenceLabels(item.else, labels);
    } else if (item.kind === "choose") {
      for (const choice of item.choices) {
        choice.conditions.forEach((condition) => addConditionLabels(condition, labels));
        addSequenceLabels(choice.sequence, labels);
      }
      addSequenceLabels(item.default, labels);
    } else if (item.kind === "repeat") {
      addSequenceLabels(item.sequence, labels);
    } else if (item.kind === "parallel") {
      item.branches.forEach((branch) => addSequenceLabels(branch, labels));
    } else if (item.kind === "inline-condition") {
      addConditionLabels(item.condition, labels);
    }
  }
}

export function buildTraceSemanticLabels(automation: AutomationModel): Map<string, string> {
  const labels = new Map<string, string>();
  automation.triggers.forEach((trigger) => labels.set(trigger.id, trigger.alias || trigger.summary));
  automation.conditions.forEach((condition) => addConditionLabels(condition, labels));
  addSequenceLabels(automation.actions, labels);
  return labels;
}

function resultRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function matchingEdgeByLabel(graph: AutomationGraph, source: string, label: string): string | null {
  return graph.edges.find((edge) => edge.source === source && edge.label === label)?.id ?? null;
}

export function traceBranchEdgeIds(
  steps: TraceStepLike[],
  graph: AutomationGraph,
): Set<string> {
  const output = new Set<string>();
  const nodeIds = graph.nodes.map((node) => node.id);

  for (const step of steps) {
    const nodeId = tracePathToNodeId(step.path, nodeIds);
    if (!nodeId) continue;

    const result = resultRecord(step.result);
    if (!result) continue;

    const isChoose = step.path.split("/").includes("choose");
    if (isChoose && result.choice != null) {
      if (result.choice === "default") {
        const edgeId = matchingEdgeByLabel(graph, nodeId, "Default");
        if (edgeId) output.add(edgeId);
        continue;
      }

      const choiceIndex = typeof result.choice === "number"
        ? result.choice
        : /^\d+$/.test(String(result.choice))
          ? Number(result.choice)
          : null;

      if (choiceIndex != null) {
        const branchEdges = graph.edges.filter(
          (edge) => edge.source === nodeId
            && edge.label != null
            && edge.label !== "Default"
            && edge.label !== "No match",
        );
        const edgeId = branchEdges[choiceIndex]?.id;
        if (edgeId) output.add(edgeId);
      }
      continue;
    }

    const branch = result.choice === "then" || result.result === true
      ? "true"
      : result.choice === "else" || result.result === false
        ? "false"
        : null;

    if (branch) {
      const edgeId = matchingEdgeByLabel(graph, nodeId, branch);
      if (edgeId) output.add(edgeId);
    }
  }

  return output;
}
