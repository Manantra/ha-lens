import {
  getEnablementState,
  type AutomationModel,
  type ConditionNode,
  type SequenceItem,
} from "@ha-lens/model";

export type LintSeverity = "info" | "warning";

export interface LintIssue {
  ruleId: string;
  severity: LintSeverity;
  title: string;
  detail: string;
  nodeId?: string;
}

function enabledState(raw: Record<string, unknown>) {
  return getEnablementState(raw);
}


function triggerReferenceIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim());
}

function collectConditions(conditions: ConditionNode[], output: ConditionNode[]) {
  for (const condition of conditions) {
    output.push(condition);
    if (condition.children?.length) collectConditions(condition.children, output);
  }
}

function collectActions(items: SequenceItem[], output: SequenceItem[]) {
  for (const item of items) {
    output.push(item);
    if (item.kind === "if") {
      collectActions(item.then, output);
      collectActions(item.else, output);
    } else if (item.kind === "choose") {
      item.choices.forEach((choice) => collectActions(choice.sequence, output));
      collectActions(item.default, output);
    } else if (item.kind === "repeat") {
      collectActions(item.sequence, output);
    } else if (item.kind === "parallel") {
      item.branches.forEach((branch) => collectActions(branch, output));
    } else if (item.kind === "sequence") {
      collectActions(item.sequence, output);
    }
  }
}

function collectNestedConditions(items: SequenceItem[], output: ConditionNode[]) {
  for (const item of items) {
    if (item.kind === "if") {
      collectConditions(item.conditions, output);
      collectNestedConditions(item.then, output);
      collectNestedConditions(item.else, output);
    } else if (item.kind === "choose") {
      item.choices.forEach((choice) => {
        collectConditions(choice.conditions, output);
        collectNestedConditions(choice.sequence, output);
      });
      collectNestedConditions(item.default, output);
    } else if (item.kind === "repeat") {
      collectNestedConditions(item.sequence, output);
    } else if (item.kind === "parallel") {
      item.branches.forEach((branch) => collectNestedConditions(branch, output));
    } else if (item.kind === "sequence") {
      collectNestedConditions(item.sequence, output);
    } else if (item.kind === "inline-condition") {
      collectConditions([item.condition], output);
    }
  }
}

function findUnreachableAfterStop(items: SequenceItem[], output: LintIssue[]) {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.kind === "stop" && enabledState(item.raw) === "enabled") {
      const nextActive = items.slice(index + 1).find((candidate) => enabledState(candidate.raw) !== "disabled");
      if (nextActive) {
        output.push({
          ruleId: "HAL006",
          severity: "warning",
          title: "Steps follow an unconditional stop",
          detail: `“${nextActive.alias || nextActive.summary}” and later siblings cannot be reached when this stop executes.`,
          nodeId: item.id,
        });
      }
      break;
    }

    if (item.kind === "if") {
      findUnreachableAfterStop(item.then, output);
      findUnreachableAfterStop(item.else, output);
    } else if (item.kind === "choose") {
      item.choices.forEach((choice) => findUnreachableAfterStop(choice.sequence, output));
      findUnreachableAfterStop(item.default, output);
    } else if (item.kind === "repeat") {
      findUnreachableAfterStop(item.sequence, output);
    } else if (item.kind === "parallel") {
      item.branches.forEach((branch) => findUnreachableAfterStop(branch, output));
    } else if (item.kind === "sequence") {
      findUnreachableAfterStop(item.sequence, output);
    }
  }
}

export function lintAutomation(automation: AutomationModel): LintIssue[] {
  const issues: LintIssue[] = [];
  const actions: SequenceItem[] = [];
  const conditions: ConditionNode[] = [];
  collectActions(automation.actions, actions);
  collectConditions(automation.conditions, conditions);
  collectNestedConditions(automation.actions, conditions);

  if (automation.triggers.length === 0) {
    issues.push({
      ruleId: "HAL001",
      severity: "info",
      title: "No automatic triggers",
      detail: "This automation has no parsed trigger leaves. It can still be run manually or called by another workflow.",
    });
  } else if (automation.triggers.every((trigger) => enabledState(trigger.raw) === "disabled")) {
    issues.push({
      ruleId: "HAL002",
      severity: "warning",
      title: "All triggers are statically disabled",
      detail: "Home Assistant has no enabled trigger in this automation until one of these trigger blocks is enabled.",
    });
  }

  if (automation.actions.length === 0) {
    issues.push({
      ruleId: "HAL003",
      severity: "info",
      title: "No actions",
      detail: "The automation contains no action steps.",
    });
  } else if (automation.actions.every((item) => enabledState(item.raw) === "disabled")) {
    issues.push({
      ruleId: "HAL004",
      severity: "warning",
      title: "All top-level actions are statically disabled",
      detail: "The action sequence has no statically enabled top-level step.",
    });
  }

  const dynamicTriggers = automation.triggers.filter((trigger) => enabledState(trigger.raw) === "dynamic").length;
  const dynamicConditions = conditions.filter((condition) => enabledState(condition.raw) === "dynamic").length;
  const dynamicActions = actions.filter((item) => enabledState(item.raw) === "dynamic").length;
  const dynamicTotal = dynamicTriggers + dynamicConditions + dynamicActions;
  if (dynamicTotal > 0) {
    issues.push({
      ruleId: "HAL005",
      severity: "info",
      title: "Runtime-enabled blocks",
      detail: `${dynamicTotal} block${dynamicTotal === 1 ? " uses" : "s use"} templated or otherwise dynamic enabled state. HA Lens cannot know statically whether ${dynamicTotal === 1 ? "it runs" : "they run"}.`,
    });
  }

  findUnreachableAfterStop(automation.actions, issues);

  const triggerIdCounts = new Map<string, number>();
  for (const trigger of automation.triggers) {
    const id = typeof trigger.raw.id === "string" ? trigger.raw.id.trim() : "";
    if (id) triggerIdCounts.set(id, (triggerIdCounts.get(id) ?? 0) + 1);
  }

  const triggerConditions = conditions.filter((condition) => condition.conditionType === "trigger");
  const referencedTriggerIds = new Set(triggerConditions.flatMap((condition) => triggerReferenceIds(condition.raw.id)));

  for (const [id, count] of triggerIdCounts) {
    if (count > 1 && referencedTriggerIds.has(id)) {
      issues.push({
        ruleId: "HAL009",
        severity: "info",
        title: "Shared trigger ID",
        detail: `${count} triggers share “${id}”. Home Assistant 2026.10 still supports shared manual IDs, but its editor may offer to assign unique IDs when a Triggered by condition references them.`,
      });
    }
  }

  for (const condition of triggerConditions) {
    const missing = triggerReferenceIds(condition.raw.id).filter((id) => !triggerIdCounts.has(id));
    if (missing.length) {
      issues.push({
        ruleId: "HAL010",
        severity: "warning",
        title: "Triggered by references a missing trigger",
        detail: `This condition references ${missing.map((id) => `“${id}”`).join(", ")}, but no current trigger uses that ID. Home Assistant 2026.10 flags the same dangling reference in the automation editor.`,
        nodeId: condition.id,
      });
    }
  }

  const inputEntityStatePattern = /^input_(?:select|text|number|boolean|datetime)\.[\da-z_]+$/i;
  for (const condition of conditions) {
    if (condition.conditionType !== "state" || condition.raw.for == null) continue;
    const state = condition.raw.state;
    const invalidReason = condition.raw.attribute != null
      ? "an attribute"
      : Array.isArray(state) && state.length > 1
        ? "a list of states"
        : inputEntityStatePattern.test(String(Array.isArray(state) ? state[0] ?? "" : state ?? ""))
          ? "a state resolved from another input entity"
          : null;
    if (!invalidReason) continue;

    issues.push({
      ruleId: "HAL011",
      severity: "warning",
      title: "Invalid state duration in Home Assistant 2026.10",
      detail: `Home Assistant 2026.10 rejects a state condition that combines “for” with ${invalidReason}. Remove “for” or use a single literal state.`,
      nodeId: condition.id,
    });
  }

  const unknownActions = actions.filter((item) => item.kind === "unknown");
  if (unknownActions.length > 0) {
    issues.push({
      ruleId: "HAL007",
      severity: "warning",
      title: "Partially modeled actions",
      detail: `${unknownActions.length} action${unknownActions.length === 1 ? " is" : "s are"} preserved as unknown. Home Assistant may support the syntax even though HA Lens cannot model its behavior yet.`,
      nodeId: unknownActions[0].id,
    });
  }

  const unknownTriggers = automation.triggers.filter((trigger) => trigger.triggerType === "unknown").length;
  const unknownConditions = conditions.filter((condition) => condition.conditionType === "unknown").length;
  if (unknownTriggers + unknownConditions > 0) {
    issues.push({
      ruleId: "HAL008",
      severity: "info",
      title: "Generic trigger or condition syntax",
      detail: `${unknownTriggers + unknownConditions} trigger/condition block${unknownTriggers + unknownConditions === 1 ? " is" : "s are"} shown generically because HA Lens does not recognize a more specific type.`,
    });
  }

  return issues;
}
