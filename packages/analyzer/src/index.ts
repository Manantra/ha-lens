import type { AnalysisResult, AutomationModel, ConditionNode, Insight, SequenceItem, TriggerNode, UnknownRecord } from "@ha-lens/model";

const entityHelperPattern = /\b(?:states|is_state|is_state_attr|state_attr|has_value|expand)\(\s*["']([a-z0-9_]+\.[a-z0-9_]+)["']/gi;
const dottedStatePattern = /\bstates\.([a-z0-9_]+)\.([a-z0-9_]+)\b/gi;
const scriptControlActions = new Set(["script.turn_on", "script.turn_off", "script.toggle", "script.reload"]);

function collectTemplateEntities(value: unknown, output: Set<string>) {
  if (typeof value === "string") {
    for (const match of value.matchAll(entityHelperPattern)) output.add(match[1]);
    for (const match of value.matchAll(dottedStatePattern)) output.add(`${match[1]}.${match[2]}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectTemplateEntities(item, output));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as UnknownRecord)) {
      if (key === "entity_id") {
        const values = Array.isArray(child) ? child : [child];
        values.filter((item): item is string => typeof item === "string").forEach((item) => output.add(item));
      }
      if (key === "scene" && typeof child === "string" && /^[a-z0-9_]+\.[a-z0-9_]+$/i.test(child)) {
        output.add(child);
      }
      if (
        (key === "action" || key === "service")
        && typeof child === "string"
        && child.startsWith("script.")
        && !scriptControlActions.has(child)
      ) {
        output.add(child);
      }
      collectTemplateEntities(child, output);
    }
  }
}

function countCondition(condition: ConditionNode): { count: number; decisions: number; depth: number } {
  const children = condition.children ?? [];
  const nested = children.map(countCondition);
  return {
    count: 1 + nested.reduce((sum, value) => sum + value.count, 0),
    decisions: 1 + nested.reduce((sum, value) => sum + value.decisions, 0),
    depth: 1 + Math.max(0, ...nested.map((value) => value.depth)),
  };
}

function inspectSequence(items: SequenceItem[], depth = 1): {
  actions: number;
  decisions: number;
  maxDepth: number;
  calls: string[];
  insights: Insight[];
} {
  let actions = 0;
  let decisions = 0;
  let maxDepth = depth;
  const calls: string[] = [];
  const insights: Insight[] = [];

  for (const item of items) {
    actions += 1;
    maxDepth = Math.max(maxDepth, depth);
    if (item.kind === "service") calls.push(item.action);
    if (item.kind === "device-action") calls.push(`${item.domain}.${item.actionType} [device]`);
    if (item.kind === "unknown") insights.push({ level: "warning", nodeId: item.id, message: "Unsupported syntax is kept visible as an unknown node." });
    if (item.kind === "wait" && item.timeout == null) insights.push({ level: "info", nodeId: item.id, message: "This wait has no timeout and may pause indefinitely." });
    if (item.kind === "choose" && item.default.length === 0) insights.push({ level: "info", nodeId: item.id, message: "This choose block has no default. If no option matches, execution continues after it." });

    if (item.kind === "if") {
      decisions += 1;
      const thenInfo = inspectSequence(item.then, depth + 1);
      const elseInfo = inspectSequence(item.else, depth + 1);
      actions += thenInfo.actions + elseInfo.actions;
      decisions += thenInfo.decisions + elseInfo.decisions;
      maxDepth = Math.max(maxDepth, thenInfo.maxDepth, elseInfo.maxDepth);
      calls.push(...thenInfo.calls, ...elseInfo.calls);
      insights.push(...thenInfo.insights, ...elseInfo.insights);
    } else if (item.kind === "choose") {
      decisions += item.choices.length;
      for (const choice of item.choices) {
        const info = inspectSequence(choice.sequence, depth + 1);
        actions += info.actions;
        decisions += info.decisions;
        maxDepth = Math.max(maxDepth, info.maxDepth);
        calls.push(...info.calls);
        insights.push(...info.insights);
      }
      const fallback = inspectSequence(item.default, depth + 1);
      actions += fallback.actions;
      decisions += fallback.decisions;
      maxDepth = Math.max(maxDepth, fallback.maxDepth);
      calls.push(...fallback.calls);
      insights.push(...fallback.insights);
    } else if (item.kind === "repeat") {
      const info = inspectSequence(item.sequence, depth + 1);
      actions += info.actions;
      decisions += info.decisions;
      maxDepth = Math.max(maxDepth, info.maxDepth);
      calls.push(...info.calls);
      insights.push(...info.insights);
      insights.push({ level: "info", nodeId: item.id, message: "Repeat execution is shown symbolically; iteration count may depend on runtime state." });
    } else if (item.kind === "parallel") {
      insights.push({ level: "info", nodeId: item.id, message: "Parallel branches execute concurrently; path analysis keeps this block symbolic in v0.1." });
      for (const branch of item.branches) {
        const info = inspectSequence(branch, depth + 1);
        actions += info.actions;
        decisions += info.decisions;
        maxDepth = Math.max(maxDepth, info.maxDepth);
        calls.push(...info.calls);
        insights.push(...info.insights);
      }
    } else if (item.kind === "inline-condition") {
      decisions += 1;
    }
  }

  return { actions, decisions, maxDepth, calls, insights };
}

type EntityUsageDetail = { nodeId: string; context: string };
type EntityUsageMap = Map<string, EntityUsageDetail[]>;

function collectRecordEntities(raw: UnknownRecord, output: Set<string>, ignoredKeys: Set<string> = new Set()) {
  for (const [key, child] of Object.entries(raw)) {
    if (ignoredKeys.has(key)) continue;
    if (key === "entity_id") {
      const values = Array.isArray(child) ? child : [child];
      values.filter((item): item is string => typeof item === "string").forEach((item) => output.add(item));
    }
    if (
      (key === "action" || key === "service")
      && typeof child === "string"
      && child.startsWith("script.")
      && !scriptControlActions.has(child)
    ) {
      output.add(child);
    }
    collectTemplateEntities(child, output);
  }
}

function recordEntityUsage(
  raw: UnknownRecord,
  nodeId: string,
  context: string,
  usage: EntityUsageMap,
  ignoredKeys: string[] = [],
) {
  const entities = new Set<string>();
  collectRecordEntities(raw, entities, new Set(ignoredKeys));
  for (const entity of entities) {
    const details = usage.get(entity) ?? [];
    if (!details.some((detail) => detail.nodeId === nodeId && detail.context === context)) {
      details.push({ nodeId, context });
    }
    usage.set(entity, details);
  }
}

function readableValue(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map((item) => String(item)).join(" / ");
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function triggerUsageContext(trigger: TriggerNode, index: number): string {
  const prefix = `Trigger ${index + 1}`;
  if (trigger.alias) return `${prefix} · ${trigger.alias}`;

  if (trigger.triggerType === "state") {
    const from = readableValue(trigger.raw.from);
    const to = readableValue(trigger.raw.to);
    const transition = from && to ? `${from} → ${to}` : to ? `→ ${to}` : from ? `${from} →` : "state change";
    return `${prefix} · State ${transition}`;
  }

  const type = trigger.triggerType
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return `${prefix} · ${type || "Trigger"}`;
}

function conditionLabel(condition: ConditionNode): string {
  if (condition.alias) return condition.alias;
  const labels: Record<string, string> = {
    state: "State condition",
    numeric_state: "Numeric state condition",
    template: "Template condition",
    time: "Time condition",
    sun: "Sun condition",
    trigger: "Trigger condition",
    zone: "Zone condition",
    device: "Device condition",
    and: "AND condition",
    or: "OR condition",
    not: "NOT condition",
  };
  return labels[condition.conditionType] ?? condition.summary;
}

function recordConditionUsage(
  condition: ConditionNode,
  graphNodeId: string,
  prefix: string[],
  usage: EntityUsageMap,
) {
  const label = conditionLabel(condition);
  const contextParts = [...prefix, label];
  recordEntityUsage(
    condition.raw,
    graphNodeId,
    contextParts.join(" → "),
    usage,
    condition.children?.length ? ["conditions"] : [],
  );
  for (const child of condition.children ?? []) {
    recordConditionUsage(child, graphNodeId, contextParts, usage);
  }
}

function recordSequenceUsage(items: SequenceItem[], usage: EntityUsageMap, prefix: string[] = []) {
  for (const item of items) {
    const itemLabel = item.kind === "service"
      ? (item.alias || `Action · ${item.action}`)
      : item.kind === "device-action"
        ? (item.alias || `Device action · ${item.summary}`)
        : (item.alias || item.summary);

    if (item.kind === "if") {
      recordEntityUsage(item.raw, item.id, [...prefix, itemLabel].join(" → "), usage, ["if", "then", "else"]);
      item.conditions.forEach((condition) => recordConditionUsage(condition, item.id, [...prefix, itemLabel], usage));
      recordSequenceUsage(item.then, usage, [...prefix, itemLabel, "Then"]);
      recordSequenceUsage(item.else, usage, [...prefix, itemLabel, "Else"]);
    } else if (item.kind === "choose") {
      recordEntityUsage(item.raw, item.id, [...prefix, itemLabel].join(" → "), usage, ["choose", "default"]);
      item.choices.forEach((choice, index) => {
        const choiceLabel = choice.alias || `Option ${index + 1}`;
        choice.conditions.forEach((condition) =>
          recordConditionUsage(condition, item.id, [...prefix, itemLabel, choiceLabel], usage)
        );
        recordSequenceUsage(choice.sequence, usage, [...prefix, itemLabel, choiceLabel]);
      });
      recordSequenceUsage(item.default, usage, [...prefix, itemLabel, "Default"]);
    } else if (item.kind === "repeat") {
      const repeatRaw = item.raw.repeat;
      if (repeatRaw && typeof repeatRaw === "object" && !Array.isArray(repeatRaw)) {
        recordEntityUsage(
          repeatRaw as UnknownRecord,
          item.id,
          [...prefix, itemLabel, "Loop control"].join(" → "),
          usage,
          ["sequence"],
        );
      }
      recordEntityUsage(item.raw, item.id, [...prefix, itemLabel].join(" → "), usage, ["repeat"]);
      recordSequenceUsage(item.sequence, usage, [...prefix, itemLabel, "Loop body"]);
    } else if (item.kind === "parallel") {
      recordEntityUsage(item.raw, item.id, [...prefix, itemLabel].join(" → "), usage, ["parallel"]);
      item.branches.forEach((branch, index) =>
        recordSequenceUsage(branch, usage, [...prefix, itemLabel, `Branch ${index + 1}`])
      );
    } else if (item.kind === "inline-condition") {
      recordConditionUsage(item.condition, item.id, prefix, usage);
    } else {
      recordEntityUsage(item.raw, item.id, [...prefix, itemLabel].join(" → "), usage);
    }
  }
}

function summarizeSequence(items: SequenceItem[]): string {
  if (!items.length) return "nothing";
  const labels = items.slice(0, 3).map((item) => item.summary);
  const suffix = items.length > 3 ? ` and ${items.length - 3} more step${items.length - 3 === 1 ? "" : "s"}` : "";
  return labels.join(", ") + suffix;
}

export function explainAutomation(automation: AutomationModel): string[] {
  const lines: string[] = [];

  if (automation.triggers.length) {
    lines.push(`Starts when ${automation.triggers.map((trigger) => trigger.summary).join(" or ")}.`);
  } else {
    lines.push("Has no explicit trigger in the pasted YAML, so the flow begins manually or from an unspecified source.");
  }

  if (automation.conditions.length) {
    lines.push(`Before actions run, every top-level condition must pass: ${automation.conditions.map((condition) => condition.summary).join("; ")}.`);
  }

  for (const item of automation.actions) {
    if (item.kind === "service") {
      lines.push(`Then it calls ${item.summary}.`);
    } else if (item.kind === "device-action") {
      lines.push(`Then it runs the ${item.summary} device action in the ${item.domain} domain.`);
    } else if (item.kind === "if") {
      const conditionText = item.conditions.map((condition) => condition.summary).join("; ") || "its condition";
      lines.push(`Decision: ${conditionText}. If true: ${summarizeSequence(item.then)}. If false: ${summarizeSequence(item.else)}.`);
    } else if (item.kind === "choose") {
      lines.push(`Choose checks ${item.choices.length} option${item.choices.length === 1 ? "" : "s"} in order and runs the first match${item.default.length ? ", otherwise it uses the default branch" : ""}.`);
    } else if (item.kind === "repeat") {
      lines.push(`${item.summary} repeats a nested sequence; HA Lens keeps the loop symbolic because the actual iteration count can depend on runtime state.`);
    } else if (item.kind === "parallel") {
      lines.push(`${item.summary} starts ${item.branches.length} branches concurrently.`);
    } else if (item.kind === "wait") {
      lines.push(`${item.summary}${item.timeout != null ? ` with timeout ${String(item.timeout)}` : " without a timeout"}.`);
    } else if (item.kind === "stop") {
      lines.push(`${item.summary} ends execution at that point.`);
    } else if (item.kind === "inline-condition") {
      lines.push(`${item.summary} must pass or execution stops immediately.`);
    } else {
      lines.push(`${item.summary} is part of the action sequence.`);
    }
  }

  return lines;
}

function countTemplates(value: unknown): number {
  if (typeof value === "string") return value.includes("{{") || value.includes("{%") ? 1 : 0;
  if (Array.isArray(value)) return value.reduce((sum, child) => sum + countTemplates(child), 0);
  if (value && typeof value === "object") return Object.values(value as UnknownRecord).reduce<number>((sum, child) => sum + countTemplates(child), 0);
  return 0;
}

export function analyzeAutomation(automation: AutomationModel): AnalysisResult {
  const entities = new Set<string>();
  collectTemplateEntities(automation.raw, entities);

  const conditionStats = automation.conditions.map(countCondition);
  const sequenceInfo = inspectSequence(automation.actions);
  const entityUsage = new Map<string, EntityUsageDetail[]>();
  automation.triggers.forEach((trigger, index) =>
    recordEntityUsage(trigger.raw, trigger.id, triggerUsageContext(trigger, index), entityUsage)
  );
  automation.conditions.forEach((condition) =>
    recordConditionUsage(condition, condition.id, ["Top-level condition"], entityUsage)
  );
  recordSequenceUsage(automation.actions, entityUsage);
  const conditionCount = conditionStats.reduce((sum, value) => sum + value.count, 0);
  const conditionDepth = Math.max(0, ...conditionStats.map((value) => value.depth));

  return {
    stats: {
      triggers: automation.triggers.length,
      conditions: conditionCount,
      actions: sequenceInfo.actions,
      decisionPoints: conditionStats.reduce((sum, value) => sum + value.decisions, 0) + sequenceInfo.decisions,
      maximumNesting: Math.max(conditionDepth, sequenceInfo.maxDepth),
      templates: countTemplates(automation.raw),
    },
    entities: [...entities].sort(),
    entityUsages: Object.fromEntries(
      [...entityUsage.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([entity, details]) => [entity, [...new Set(details.map((detail) => detail.nodeId))]]),
    ),
    entityUsageDetails: Object.fromEntries(
      [...entityUsage.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([entity, details]) => [entity, details]),
    ),
    actions: [...new Set(sequenceInfo.calls)].sort(),
    insights: sequenceInfo.insights,
  };
}
