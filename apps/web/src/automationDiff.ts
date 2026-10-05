import type {
  AutomationGraph,
  AutomationModel,
  ConditionNode,
  GraphEdge,
  GraphNode,
  SequenceItem,
  TriggerNode,
  UnknownRecord,
} from "@ha-lens/model";

export type DiffStatus = "added" | "removed" | "changed";

export interface AutomationDiffChange {
  key: string;
  status: DiffStatus;
  kind: string;
  label: string;
  beforeLabel?: string;
  afterLabel?: string;
  detail?: string;
  graphNodeId?: string;
}

export interface AutomationDiffResult {
  graph: AutomationGraph;
  nodeStates: Map<string, DiffStatus>;
  edgeStates: Map<string, DiffStatus>;
  changes: AutomationDiffChange[];
  metadataChanges: AutomationDiffChange[];
  stats: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
  };
  hasChanges: boolean;
}

type SemanticNode = TriggerNode | ConditionNode | SequenceItem;

interface DiffContext {
  baselineToCurrent: Map<string, string>;
  addedCurrentIds: Set<string>;
  removedBaselineIds: Set<string>;
  changedCurrentIds: Set<string>;
  unchangedCurrentIds: Set<string>;
  changes: AutomationDiffChange[];
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

function targetHint(raw: UnknownRecord): string {
  const target = isRecord(raw.target) ? raw.target : {};
  const keys = ["entity_id", "device_id", "area_id", "floor_id", "label_id"];
  return canonical(Object.fromEntries(
    keys.flatMap((key) => {
      const value = target[key] ?? raw[key];
      return value == null ? [] : [[key, value]];
    }),
  ));
}

function normalizedTriggerRaw(raw: UnknownRecord): UnknownRecord {
  if (typeof raw.id !== "string" || !raw.id.startsWith("generated-")) return raw;
  const normalized = { ...raw };
  delete normalized.id;
  return normalized;
}

function conditionIdentity(node: ConditionNode): string {
  return [
    "condition",
    node.conditionType,
    node.alias || "",
    targetHint(node.raw),
  ].join("|");
}

function triggerIdentity(node: TriggerNode): string {
  return [
    "trigger",
    node.triggerType,
    node.alias || "",
    targetHint(node.raw),
  ].join("|");
}

function sequenceIdentity(node: SequenceItem): string {
  switch (node.kind) {
    case "service":
      return ["service", node.action, node.alias || "", targetHint(node.raw)].join("|");
    case "device-action":
      return ["device", node.domain, node.actionType, node.alias || "", node.entityId || "", node.deviceId || ""].join("|");
    case "inline-condition":
      return ["inline-condition", conditionIdentity(node.condition), node.alias || ""].join("|");
    case "if":
      return ["if", node.alias || ""].join("|");
    case "choose":
      return ["choose", node.alias || ""].join("|");
    case "repeat":
      return ["repeat", node.repeatType, node.alias || ""].join("|");
    case "parallel":
      return ["parallel", node.alias || ""].join("|");
    case "sequence":
      return ["sequence", node.alias || ""].join("|");
    case "event":
      return ["event", node.eventType, node.alias || ""].join("|");
    case "conversation-response":
      return ["conversation-response", node.alias || ""].join("|");
    case "wait":
      return ["wait", node.waitType, node.alias || ""].join("|");
    default:
      return [node.kind, node.alias || ""].join("|");
  }
}

function nodeFingerprint(node: SemanticNode): string {
  if (node.kind === "trigger") return canonical(normalizedTriggerRaw(node.raw));
  if (node.kind === "condition") return canonical(node.raw);

  switch (node.kind) {
    case "if":
      return canonical({
        kind: node.kind,
        alias: node.alias || null,
        conditions: node.conditions.map((condition) => condition.raw),
      });
    case "choose":
      return canonical({
        kind: node.kind,
        alias: node.alias || null,
        choices: node.choices.map((choice) => ({
          alias: choice.alias || null,
          conditions: choice.conditions.map((condition) => condition.raw),
        })),
        hasDefault: node.default.length > 0,
      });
    case "repeat": {
      const repeatRaw = isRecord(node.raw.repeat) ? { ...node.raw.repeat } : {};
      delete repeatRaw.sequence;
      return canonical({
        kind: node.kind,
        alias: node.alias || null,
        repeatType: node.repeatType,
        repeat: repeatRaw,
      });
    }
    case "parallel":
      return canonical({
        kind: node.kind,
        alias: node.alias || null,
        branchCount: node.branches.length,
        enabled: node.raw.enabled ?? true,
      });
    case "sequence": {
      const raw = { ...node.raw };
      delete raw.sequence;
      return canonical({ kind: node.kind, raw });
    }
    default:
      return canonical(node.raw);
  }
}

function changedTopLevelKeys(before: UnknownRecord, after: UnknownRecord): string[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return keys.filter((key) => canonical(before[key]) !== canonical(after[key]));
}

function greedyPairs<T>(before: T[], after: T[], identity: (value: T) => string): Array<[number, number]> {
  const positions = new Map<string, number[]>();
  after.forEach((item, index) => {
    const key = identity(item);
    const list = positions.get(key) ?? [];
    list.push(index);
    positions.set(key, list);
  });

  const pairs: Array<[number, number]> = [];
  let lastAfter = -1;
  for (let beforeIndex = 0; beforeIndex < before.length; beforeIndex += 1) {
    const list = positions.get(identity(before[beforeIndex])) ?? [];
    const afterIndex = list.find((index) => index > lastAfter);
    if (afterIndex == null) continue;
    pairs.push([beforeIndex, afterIndex]);
    lastAfter = afterIndex;
  }
  return pairs;
}

function lcsPairs<T>(
  before: T[],
  after: T[],
  identity: (value: T) => string,
): Array<[number, number]> {
  // Avoid quadratic memory/time on very large automations. The greedy fallback
  // preserves order and semantic identity without allocating an O(n*m) matrix.
  if (before.length * after.length > 25_000) return greedyPairs(before, after, identity);

  const rows = before.length + 1;
  const cols = after.length + 1;
  const table = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let left = before.length - 1; left >= 0; left -= 1) {
    for (let right = after.length - 1; right >= 0; right -= 1) {
      table[left][right] = identity(before[left]) === identity(after[right])
        ? table[left + 1][right + 1] + 1
        : Math.max(table[left + 1][right], table[left][right + 1]);
    }
  }

  const pairs: Array<[number, number]> = [];
  let left = 0;
  let right = 0;
  while (left < before.length && right < after.length) {
    if (identity(before[left]) === identity(after[right])) {
      pairs.push([left, right]);
      left += 1;
      right += 1;
    } else if (table[left + 1][right] >= table[left][right + 1]) {
      left += 1;
    } else {
      right += 1;
    }
  }
  return pairs;
}

function graphKind(node: SemanticNode): string {
  if (node.kind === "trigger") return "trigger";
  if (node.kind === "condition") return "condition";
  if (node.kind === "service" || node.kind === "device-action" || node.kind === "event" || node.kind === "conversation-response") return "action";
  if (node.kind === "if" || node.kind === "choose" || node.kind === "sequence") return "control";
  if (node.kind === "repeat") return "loop";
  return node.kind;
}

function addChange(
  ctx: DiffContext,
  status: DiffStatus,
  node: SemanticNode,
  graphNodeId: string,
  beforeLabel?: string,
  afterLabel?: string,
  detail?: string,
) {
  ctx.changes.push({
    key: `${status}:${graphNodeId}`,
    status,
    kind: graphKind(node),
    label: afterLabel || beforeLabel || node.summary,
    beforeLabel,
    afterLabel,
    detail,
    graphNodeId,
  });
}

function markAddedSequence(items: SequenceItem[], ctx: DiffContext) {
  for (const item of items) {
    ctx.addedCurrentIds.add(item.id);
    addChange(ctx, "added", item, item.id, undefined, item.summary);

    if (item.kind === "if") {
      markAddedSequence(item.then, ctx);
      markAddedSequence(item.else, ctx);
    } else if (item.kind === "choose") {
      item.choices.forEach((choice) => markAddedSequence(choice.sequence, ctx));
      markAddedSequence(item.default, ctx);
    } else if (item.kind === "repeat") {
      markAddedSequence(item.sequence, ctx);
    } else if (item.kind === "parallel") {
      item.branches.forEach((branch) => markAddedSequence(branch, ctx));
    } else if (item.kind === "sequence") {
      markAddedSequence(item.sequence, ctx);
    }
  }
}

function markRemovedSequence(items: SequenceItem[], ctx: DiffContext) {
  for (const item of items) {
    ctx.removedBaselineIds.add(item.id);
    addChange(ctx, "removed", item, `diff-removed:${item.id}`, item.summary, undefined);

    if (item.kind === "if") {
      markRemovedSequence(item.then, ctx);
      markRemovedSequence(item.else, ctx);
    } else if (item.kind === "choose") {
      item.choices.forEach((choice) => markRemovedSequence(choice.sequence, ctx));
      markRemovedSequence(item.default, ctx);
    } else if (item.kind === "repeat") {
      markRemovedSequence(item.sequence, ctx);
    } else if (item.kind === "parallel") {
      item.branches.forEach((branch) => markRemovedSequence(branch, ctx));
    } else if (item.kind === "sequence") {
      markRemovedSequence(item.sequence, ctx);
    }
  }
}

function choiceIdentity(choice: { alias?: string; conditions: ConditionNode[] }): string {
  return canonical({
    alias: choice.alias || null,
    conditions: choice.conditions.map((condition) => condition.raw),
  });
}

function compareSequenceNode(before: SequenceItem, after: SequenceItem, ctx: DiffContext) {
  compareNode(before, after, ctx);

  if (before.kind === "if" && after.kind === "if") {
    matchSequence(before.then, after.then, ctx);
    matchSequence(before.else, after.else, ctx);
  } else if (before.kind === "choose" && after.kind === "choose") {
    const pairs = lcsPairs(before.choices, after.choices, choiceIdentity);
    const matchedBefore = new Set(pairs.map(([index]) => index));
    const matchedAfter = new Set(pairs.map(([, index]) => index));

    for (const [beforeIndex, afterIndex] of pairs) {
      matchSequence(before.choices[beforeIndex].sequence, after.choices[afterIndex].sequence, ctx);
    }
    before.choices.forEach((choice, index) => {
      if (!matchedBefore.has(index)) markRemovedSequence(choice.sequence, ctx);
    });
    after.choices.forEach((choice, index) => {
      if (!matchedAfter.has(index)) markAddedSequence(choice.sequence, ctx);
    });
    matchSequence(before.default, after.default, ctx);
  } else if (before.kind === "repeat" && after.kind === "repeat") {
    matchSequence(before.sequence, after.sequence, ctx);
  } else if (before.kind === "parallel" && after.kind === "parallel") {
    const common = Math.min(before.branches.length, after.branches.length);
    for (let index = 0; index < common; index += 1) {
      matchSequence(before.branches[index], after.branches[index], ctx);
    }
    for (let index = common; index < before.branches.length; index += 1) {
      markRemovedSequence(before.branches[index], ctx);
    }
    for (let index = common; index < after.branches.length; index += 1) {
      markAddedSequence(after.branches[index], ctx);
    }
  } else if (before.kind === "sequence" && after.kind === "sequence") {
    matchSequence(before.sequence, after.sequence, ctx);
  }
}

function compareNode(before: SemanticNode, after: SemanticNode, ctx: DiffContext) {
  ctx.baselineToCurrent.set(before.id, after.id);

  if (nodeFingerprint(before) === nodeFingerprint(after)) {
    ctx.unchangedCurrentIds.add(after.id);
    return;
  }

  ctx.changedCurrentIds.add(after.id);
  const keys = changedTopLevelKeys(before.raw, after.raw);
  addChange(
    ctx,
    "changed",
    after,
    after.id,
    before.summary,
    after.summary,
    keys.length ? `Changed: ${keys.slice(0, 4).join(", ")}${keys.length > 4 ? "…" : ""}` : "Configuration changed",
  );
}

function matchSequence(before: SequenceItem[], after: SequenceItem[], ctx: DiffContext) {
  const pairs = lcsPairs(before, after, sequenceIdentity);
  const matchedBefore = new Set(pairs.map(([index]) => index));
  const matchedAfter = new Set(pairs.map(([, index]) => index));

  for (const [beforeIndex, afterIndex] of pairs) {
    compareSequenceNode(before[beforeIndex], after[afterIndex], ctx);
  }

  before.forEach((item, index) => {
    if (!matchedBefore.has(index)) markRemovedSequence([item], ctx);
  });
  after.forEach((item, index) => {
    if (!matchedAfter.has(index)) markAddedSequence([item], ctx);
  });
}

function matchTopLevel<T extends TriggerNode | ConditionNode>(
  before: T[],
  after: T[],
  identity: (value: T) => string,
  ctx: DiffContext,
) {
  const pairs = lcsPairs(before, after, identity);
  const matchedBefore = new Set(pairs.map(([index]) => index));
  const matchedAfter = new Set(pairs.map(([, index]) => index));

  for (const [beforeIndex, afterIndex] of pairs) {
    compareNode(before[beforeIndex], after[afterIndex], ctx);
  }

  before.forEach((item, index) => {
    if (matchedBefore.has(index)) return;
    ctx.removedBaselineIds.add(item.id);
    addChange(ctx, "removed", item, `diff-removed:${item.id}`, item.summary, undefined);
  });
  after.forEach((item, index) => {
    if (matchedAfter.has(index)) return;
    ctx.addedCurrentIds.add(item.id);
    addChange(ctx, "added", item, item.id, undefined, item.summary);
  });
}

function translateBaselineNode(
  id: string,
  ctx: DiffContext,
): string | null {
  const mapped = ctx.baselineToCurrent.get(id);
  if (mapped) return mapped;
  if (ctx.removedBaselineIds.has(id)) return `diff-removed:${id}`;
  return null;
}

function removedGraphNodes(
  baselineGraph: AutomationGraph,
  ctx: DiffContext,
): GraphNode[] {
  return baselineGraph.nodes
    .filter((node) => ctx.removedBaselineIds.has(node.id))
    .map((node) => ({
      ...node,
      id: `diff-removed:${node.id}`,
      subtitle: node.subtitle ? `${node.subtitle} · baseline` : "baseline",
    }));
}

function removedGraphEdges(
  baselineGraph: AutomationGraph,
  ctx: DiffContext,
): GraphEdge[] {
  const output: GraphEdge[] = [];

  for (const edge of baselineGraph.edges) {
    const source = translateBaselineNode(edge.source, ctx);
    const target = translateBaselineNode(edge.target, ctx);
    if (!source || !target) continue;
    if (!source.startsWith("diff-removed:") && !target.startsWith("diff-removed:")) continue;

    output.push({
      ...edge,
      id: `diff-removed-edge:${edge.id}`,
      source,
      target,
    });
  }

  return output;
}

function metadataChanges(before: AutomationModel, after: AutomationModel): AutomationDiffChange[] {
  const fields: Array<[string, unknown, unknown]> = [
    ["Alias", before.alias, after.alias],
    ["Description", before.description, after.description],
    ["Mode", before.mode, after.mode],
    ["Max", before.raw.max, after.raw.max],
    ["Max exceeded", before.raw.max_exceeded, after.raw.max_exceeded],
    ["Variables", before.raw.variables, after.raw.variables],
    ["Trigger variables", before.raw.trigger_variables, after.raw.trigger_variables],
    ["Trace", before.raw.trace, after.raw.trace],
    ["Initial state", before.raw.initial_state, after.raw.initial_state],
  ];

  const display = (value: unknown): string => {
    if (value == null || value === "") return "—";
    if (["string", "number", "boolean"].includes(typeof value)) return String(value);
    const serialized = canonical(value);
    return serialized.length > 160 ? `${serialized.slice(0, 157)}…` : serialized;
  };

  return fields
    .filter(([, left, right]) => canonical(left) !== canonical(right))
    .map(([label, left, right]) => ({
      key: `metadata:${label}`,
      status: "changed" as const,
      kind: "metadata",
      label,
      beforeLabel: display(left),
      afterLabel: display(right),
      detail: "Automation metadata changed",
    }));
}

export function buildAutomationDiff(
  baseline: AutomationModel,
  current: AutomationModel,
  baselineGraph: AutomationGraph,
  currentGraph: AutomationGraph,
): AutomationDiffResult {
  const ctx: DiffContext = {
    baselineToCurrent: new Map(),
    addedCurrentIds: new Set(),
    removedBaselineIds: new Set(),
    changedCurrentIds: new Set(),
    unchangedCurrentIds: new Set(),
    changes: [],
  };

  matchTopLevel(baseline.triggers, current.triggers, triggerIdentity, ctx);
  matchTopLevel(baseline.conditions, current.conditions, conditionIdentity, ctx);
  matchSequence(baseline.actions, current.actions, ctx);

  const metadata = metadataChanges(baseline, current);
  const removedNodes = removedGraphNodes(baselineGraph, ctx);
  const removedEdges = removedGraphEdges(baselineGraph, ctx);
  const graph: AutomationGraph = {
    nodes: [...currentGraph.nodes, ...removedNodes],
    edges: [...currentGraph.edges, ...removedEdges],
  };

  const nodeStates = new Map<string, DiffStatus>();
  ctx.addedCurrentIds.forEach((id) => nodeStates.set(id, "added"));
  ctx.changedCurrentIds.forEach((id) => nodeStates.set(id, "changed"));
  ctx.removedBaselineIds.forEach((id) => nodeStates.set(`diff-removed:${id}`, "removed"));

  const edgeStates = new Map<string, DiffStatus>();
  for (const edge of currentGraph.edges) {
    if (ctx.addedCurrentIds.has(edge.source) || ctx.addedCurrentIds.has(edge.target)) {
      edgeStates.set(edge.id, "added");
    }
  }
  removedEdges.forEach((edge) => edgeStates.set(edge.id, "removed"));

  const allChanges = [...metadata, ...ctx.changes];
  const statusOrder: Record<DiffStatus, number> = { changed: 0, added: 1, removed: 2 };
  allChanges.sort((left, right) => {
    const byStatus = statusOrder[left.status] - statusOrder[right.status];
    return byStatus || left.label.localeCompare(right.label);
  });

  const stats = {
    added: ctx.addedCurrentIds.size,
    removed: ctx.removedBaselineIds.size,
    changed: ctx.changedCurrentIds.size + metadata.length,
    unchanged: ctx.unchangedCurrentIds.size,
  };

  return {
    graph,
    nodeStates,
    edgeStates,
    changes: allChanges,
    metadataChanges: metadata,
    stats,
    hasChanges: allChanges.length > 0,
  };
}
