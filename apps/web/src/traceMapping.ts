import type {
  AutomationGraph,
  AutomationModel,
  ConditionNode,
  SequenceItem,
} from "@ha-lens/model";

export interface TraceStepLike {
  path: string;
  occurrence?: number;
  repeatIndex?: number | null;
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
    } else if (item.kind === "sequence") {
      addSequenceLabels(item.sequence, labels);
    } else if (item.kind === "inline-condition") {
      addConditionLabels(item.condition, labels);
    }
  }
}


function buildSequenceItemIndex(automation: AutomationModel): Map<string, SequenceItem> {
  const index = new Map<string, SequenceItem>();

  const visit = (items: SequenceItem[]) => {
    for (const item of items) {
      index.set(item.id, item);
      if (item.kind === "if") {
        visit(item.then);
        visit(item.else);
      } else if (item.kind === "choose") {
        item.choices.forEach((choice) => visit(choice.sequence));
        visit(item.default);
      } else if (item.kind === "repeat") {
        visit(item.sequence);
      } else if (item.kind === "parallel") {
        item.branches.forEach(visit);
      } else if (item.kind === "sequence") {
        visit(item.sequence);
      }
    }
  };

  visit(automation.actions);
  return index;
}

function pushContext(output: string[], value: string | null | undefined) {
  if (!value || output[output.length - 1] === value) return;
  output.push(value);
}

function controlContext(item: SequenceItem | undefined, fallback: string): string {
  if (!item?.alias) return fallback;
  return `${fallback} · ${item.alias}`;
}

/**
 * Turn Home Assistant's runtime path into a human-readable structural breadcrumb.
 * Only structure explicitly present in the trace path is described; this never
 * infers untaken branches or runtime decisions that Home Assistant did not report.
 */
export function buildTraceBreadcrumb(
  automation: AutomationModel,
  path: string,
  repeatIndex?: number | null,
): string[] {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "action" || !/^\d+$/.test(parts[1] ?? "")) return [];

  const items = buildSequenceItemIndex(automation);
  const output: string[] = [];
  let currentId = `actions.${parts[1]}`;
  let cursor = 2;

  while (cursor < parts.length) {
    const token = parts[cursor];
    const current = items.get(currentId);

    if ((token === "then" || token === "else") && /^\d+$/.test(parts[cursor + 1] ?? "")) {
      if (current?.kind === "if") pushContext(output, controlContext(current, "If"));
      pushContext(output, token === "then" ? "Then" : "Else");
      currentId = `${currentId}.${token}.${parts[cursor + 1]}`;
      cursor += 2;
      continue;
    }

    if (token === "if") {
      if (current?.kind === "if") pushContext(output, controlContext(current, "If"));
      if (parts[cursor + 1] === "condition" && /^\d+$/.test(parts[cursor + 2] ?? "")) {
        currentId = `${currentId}.if.${parts[cursor + 2]}`;
        cursor += 3;
      } else {
        cursor += 1;
      }
      continue;
    }

    if (token === "choose" && /^\d+$/.test(parts[cursor + 1] ?? "")) {
      const choiceIndex = Number(parts[cursor + 1]);
      if (current?.kind === "choose") {
        const choice = current.choices[choiceIndex];
        const choiceLabel = choice?.alias || `Option ${choiceIndex + 1}`;
        const prefix = current.alias ? `Choose · ${current.alias}` : "Choose";
        pushContext(output, `${prefix} · ${choiceLabel}`);
      } else {
        pushContext(output, `Choose · Option ${choiceIndex + 1}`);
      }

      if (parts[cursor + 2] === "sequence" && /^\d+$/.test(parts[cursor + 3] ?? "")) {
        currentId = `${currentId}.choose.${choiceIndex}.sequence.${parts[cursor + 3]}`;
        cursor += 4;
      } else {
        cursor += 2;
      }
      continue;
    }

    if (token === "default" && /^\d+$/.test(parts[cursor + 1] ?? "")) {
      if (current?.kind === "choose") {
        pushContext(output, current.alias ? `Choose · ${current.alias} · Default` : "Choose · Default");
      } else {
        pushContext(output, "Choose · Default");
      }
      currentId = `${currentId}.default.${parts[cursor + 1]}`;
      cursor += 2;
      continue;
    }

    if (token === "repeat") {
      const base = controlContext(current, "Repeat");
      pushContext(output, repeatIndex && repeatIndex > 0 ? `${base} · iteration ${repeatIndex}` : base);
      if (parts[cursor + 1] === "sequence" && /^\d+$/.test(parts[cursor + 2] ?? "")) {
        currentId = `${currentId}.repeat.sequence.${parts[cursor + 2]}`;
        cursor += 3;
      } else {
        cursor += 1;
      }
      continue;
    }

    if (token === "parallel" && /^\d+$/.test(parts[cursor + 1] ?? "")) {
      const branchIndex = Number(parts[cursor + 1]);
      const base = controlContext(current, "Parallel");
      pushContext(output, `${base} · Branch ${branchIndex + 1}`);
      if (parts[cursor + 2] === "sequence" && /^\d+$/.test(parts[cursor + 3] ?? "")) {
        currentId = `${currentId}.parallel.${branchIndex}.${parts[cursor + 3]}`;
        cursor += 4;
      } else {
        cursor += 2;
      }
      continue;
    }

    if (token === "sequence" && /^\d+$/.test(parts[cursor + 1] ?? "")) {
      if (current?.kind === "sequence") pushContext(output, controlContext(current, "Sequence"));
      currentId = `${currentId}.sequence.${parts[cursor + 1]}`;
      cursor += 2;
      continue;
    }

    cursor += 1;
  }

  return output;
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

    const choice = result.choice;
    const isChooseChoice = choice != null && choice !== "then" && choice !== "else";
    if (isChooseChoice) {
      if (choice === "default") {
        const edgeId = matchingEdgeByLabel(graph, nodeId, "Default");
        if (edgeId) output.add(edgeId);
        continue;
      }

      const choiceIndex = typeof choice === "number"
        ? choice
        : /^\d+$/.test(String(choice))
          ? Number(choice)
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

    if (result.timeout === true) {
      const edgeId = matchingEdgeByLabel(graph, nodeId, "timeout");
      if (edgeId) output.add(edgeId);
      continue;
    }

    const wait = resultRecord(result.wait);
    if (wait?.completed === true) {
      const edgeId = matchingEdgeByLabel(graph, nodeId, "completed");
      if (edgeId) output.add(edgeId);
      continue;
    }

    const branch = choice === "then" || result.result === true
      ? "true"
      : choice === "else" || result.result === false
        ? "false"
        : null;

    if (branch) {
      const edgeId = matchingEdgeByLabel(graph, nodeId, branch);
      if (edgeId) output.add(edgeId);
    }
  }

  return output;
}


export interface ParallelTraceCoverage {
  observedBranchIndexes: Set<number>;
  totalBranches: number;
}

export interface TraceCoverage {
  executedNodeIds: Set<string>;
  executedEdgeIds: Set<string>;
  takenEdgeIds: Set<string>;
  notTakenEdgeIds: Set<string>;
  repeatIterationCounts: Map<string, number>;
  parallelBranchCoverage: Map<string, ParallelTraceCoverage>;
}

/**
 * Build a conservative last-run overlay.
 *
 * - executedNodeIds: graph nodes directly represented by Home Assistant trace paths
 * - takenEdgeIds: decision/wait edges explicitly selected by runtime results
 * - notTakenEdgeIds: sibling branch edges at a decision that produced a known outcome
 * - executedEdgeIds: explicit taken edges plus deterministic flow between executed nodes
 *
 * Nodes behind an untaken branch are intentionally not labelled "checked"; only the
 * branch edge itself receives that status. This avoids claiming runtime evaluation
 * that Home Assistant did not report.
 */
function parentControlPath(
  path: string,
  token: "repeat" | "parallel",
): { parentPath: string; tokenIndex: number; parts: string[] } | null {
  const parts = path.split("/").filter(Boolean);
  const tokenIndex = parts.lastIndexOf(token);
  if (tokenIndex <= 0) return null;
  return {
    parentPath: parts.slice(0, tokenIndex).join("/"),
    tokenIndex,
    parts,
  };
}

function repeatIterationCounts(
  steps: TraceStepLike[],
  graph: AutomationGraph,
  executedNodeIds: Set<string>,
): Map<string, number> {
  const nodeIds = graph.nodes.map((node) => node.id);
  const output = new Map<string, number>();

  for (const node of graph.nodes) {
    if (node.kind === "loop" && executedNodeIds.has(node.id)) {
      output.set(node.id, 0);
    }
  }

  for (const step of steps) {
    const control = parentControlPath(step.path, "repeat");
    if (!control || control.parts[control.tokenIndex + 1] !== "sequence") continue;

    const nodeId = tracePathToNodeId(control.parentPath, nodeIds);
    if (!nodeId || !output.has(nodeId)) continue;

    const observedIteration = typeof step.repeatIndex === "number" && step.repeatIndex > 0
      ? step.repeatIndex
      : (step.occurrence ?? 0) + 1;

    output.set(nodeId, Math.max(output.get(nodeId) ?? 0, observedIteration));
  }

  return output;
}

function parallelBranchCoverage(
  steps: TraceStepLike[],
  graph: AutomationGraph,
  executedNodeIds: Set<string>,
): Map<string, ParallelTraceCoverage> {
  const nodeIds = graph.nodes.map((node) => node.id);
  const output = new Map<string, ParallelTraceCoverage>();

  for (const node of graph.nodes) {
    if (node.kind !== "parallel" || !executedNodeIds.has(node.id)) continue;
    const totalBranches = graph.edges.filter(
      (edge) => edge.source === node.id && /^branch \d+$/.test(edge.label ?? ""),
    ).length;
    output.set(node.id, { observedBranchIndexes: new Set<number>(), totalBranches });
  }

  for (const step of steps) {
    const control = parentControlPath(step.path, "parallel");
    if (!control) continue;

    const branchIndexText = control.parts[control.tokenIndex + 1];
    const sequenceToken = control.parts[control.tokenIndex + 2];
    if (!/^\d+$/.test(branchIndexText ?? "") || sequenceToken !== "sequence") continue;

    const nodeId = tracePathToNodeId(control.parentPath, nodeIds);
    const coverage = nodeId ? output.get(nodeId) : undefined;
    if (!coverage) continue;

    coverage.observedBranchIndexes.add(Number(branchIndexText));
  }

  return output;
}

export function buildTraceCoverage(
  steps: TraceStepLike[],
  graph: AutomationGraph,
): TraceCoverage {
  const nodeIds = graph.nodes.map((node) => node.id);
  const executedNodeIds = traceNodeIds(steps.map((step) => step.path), nodeIds);
  const takenEdgeIds = traceBranchEdgeIds(steps, graph);
  const notTakenEdgeIds = new Set<string>();
  const repeats = repeatIterationCounts(steps, graph, executedNodeIds);
  const parallels = parallelBranchCoverage(steps, graph, executedNodeIds);

  const takenSources = new Set<string>();
  for (const edge of graph.edges) {
    if (takenEdgeIds.has(edge.id)) takenSources.add(edge.source);
  }

  for (const source of takenSources) {
    for (const edge of graph.edges) {
      if (
        edge.source === source
        && edge.label != null
        && !takenEdgeIds.has(edge.id)
      ) {
        notTakenEdgeIds.add(edge.id);
      }
    }
  }

  const kindByNodeId = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  const executedEdgeIds = new Set<string>(takenEdgeIds);

  // Parallel is not a choice: only branches that actually produced trace events
  // are marked executed. Missing branches stay "not reached", not "not taken".
  for (const [nodeId, coverage] of parallels) {
    for (const branchIndex of coverage.observedBranchIndexes) {
      const edgeId = matchingEdgeByLabel(graph, nodeId, `branch ${branchIndex + 1}`);
      if (edgeId) executedEdgeIds.add(edgeId);
    }
  }

  // The repeat graph is symbolic. A positive observed iteration count proves both
  // entry into the body and a return to the repeat controller.
  for (const [nodeId, iterationCount] of repeats) {
    if (iterationCount <= 0) continue;
    for (const edge of graph.edges) {
      if (
        (edge.source === nodeId && edge.label === "loop")
        || (edge.target === nodeId && edge.label === "repeat")
      ) {
        executedEdgeIds.add(edge.id);
      }
    }
  }

  for (const edge of graph.edges) {
    if (notTakenEdgeIds.has(edge.id)) continue;

    const sourceExecuted = executedNodeIds.has(edge.source);
    const targetExecuted = executedNodeIds.has(edge.target);
    const sourceKind = kindByNodeId.get(edge.source);
    const targetKind = kindByNodeId.get(edge.target);

    if (
      (sourceExecuted && targetExecuted)
      || (sourceExecuted && targetKind === "merge")
      || (sourceKind === "merge" && targetExecuted)
    ) {
      executedEdgeIds.add(edge.id);
    }
  }

  return {
    executedNodeIds,
    executedEdgeIds,
    takenEdgeIds,
    notTakenEdgeIds,
    repeatIterationCounts: repeats,
    parallelBranchCoverage: parallels,
  };
}
