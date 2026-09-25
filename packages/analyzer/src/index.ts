import type { AnalysisResult, AutomationModel, ConditionNode, Insight, SequenceItem, UnknownRecord } from "@ha-lens/model";

const entityPattern = /\b(?:states|is_state|state_attr)\(\s*["']([a-z0-9_]+\.[a-z0-9_]+)["']/gi;

function collectTemplateEntities(value: unknown, output: Set<string>) {
  if (typeof value === "string") {
    for (const match of value.matchAll(entityPattern)) output.add(match[1]);
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
    actions: [...new Set(sequenceInfo.calls)].sort(),
    insights: sequenceInfo.insights,
  };
}
