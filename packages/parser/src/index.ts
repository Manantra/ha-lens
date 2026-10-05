import { parse, stringify } from "yaml";
import type {
  AutomationModel,
  ChooseBranch,
  ConditionNode,
  ParseResult,
  SequenceItem,
  TargetReference,
  TargetReferenceKind,
  TriggerNode,
  UnknownRecord,
} from "@ha-lens/model";

const asRecord = (value: unknown): UnknownRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};

const asList = <T = unknown>(value: unknown): T[] => {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]) as T[];
};

const isDisabled = (raw: UnknownRecord): boolean => raw.enabled === false;
const MAX_NESTING_DEPTH = 64;

function assertSafeDepth(depth: number) {
  if (depth > MAX_NESTING_DEPTH) {
    throw new Error(`Automation nesting exceeds HA Lens safety limit (${MAX_NESTING_DEPTH})`);
  }
}

function flattenTriggerRecords(value: unknown, depth = 0): UnknownRecord[] {
  assertSafeDepth(depth);
  const output: UnknownRecord[] = [];
  for (const entry of asList(value)) {
    const raw = asRecord(entry);
    if (raw.triggers != null && raw.trigger == null && raw.platform == null) {
      output.push(...flattenTriggerRecords(raw.triggers, depth + 1));
      continue;
    }
    output.push(raw);
  }
  return output;
}

function normalizeConditionRecord(value: unknown): UnknownRecord {
  const raw = asRecord(value);
  if (Array.isArray(raw.condition)) return { ...raw, condition: "and", conditions: raw.condition };
  if (raw.condition != null) return raw;
  if (raw.and != null) return { ...raw, condition: "and", conditions: raw.and };
  if (raw.or != null) return { ...raw, condition: "or", conditions: raw.or };
  if (raw.not != null) return { ...raw, condition: "not", conditions: raw.not };
  return raw;
}

const targetKeyKinds: Array<[string, TargetReferenceKind]> = [
  ["entity_id", "entity"],
  ["device_id", "device"],
  ["area_id", "area"],
  ["floor_id", "floor"],
  ["label_id", "label"],
];

function targetIds(value: unknown): string[] {
  return asList(value)
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim())
    .filter((item) => !item.includes("{{") && !item.includes("{%"));
}

function extractTargets(raw: UnknownRecord): TargetReference[] {
  const buckets = new Map<TargetReferenceKind, Set<string>>();
  const addFrom = (record: UnknownRecord) => {
    for (const [key, kind] of targetKeyKinds) {
      for (const id of targetIds(record[key])) {
        const set = buckets.get(kind) ?? new Set<string>();
        set.add(id);
        buckets.set(kind, set);
      }
    }
  };
  addFrom(raw);
  addFrom(asRecord(raw.target));
  return [...buckets.entries()].map(([kind, ids]) => ({ kind, ids: [...ids] }));
}

function mergeTargets(...groups: Array<TargetReference[] | undefined>): TargetReference[] {
  const buckets = new Map<TargetReferenceKind, Set<string>>();
  for (const group of groups) {
    for (const target of group ?? []) {
      const set = buckets.get(target.kind) ?? new Set<string>();
      target.ids.forEach((id) => set.add(id));
      buckets.set(target.kind, set);
    }
  }
  return [...buckets.entries()].map(([kind, ids]) => ({ kind, ids: [...ids] }));
}

function conditionTreeTargets(value: unknown, depth = 0): TargetReference[] {
  assertSafeDepth(depth);
  const raw = normalizeConditionRecord(value);
  const own = extractTargets(raw);
  const type = stringValue(raw.condition, "unknown");
  if (!["and", "or", "not"].includes(type)) return own;
  return mergeTargets(
    own,
    ...asList(raw.conditions).map((condition) => conditionTreeTargets(condition, depth + 1)),
  );
}

function triggerListTargets(value: unknown, depth = 0): TargetReference[] {
  assertSafeDepth(depth);
  return mergeTargets(...flattenTriggerRecords(value, depth).map(extractTargets));
}

function attachConditionTargets(condition: ConditionNode) {
  condition.targets = extractTargets(condition.raw);
  condition.children?.forEach(attachConditionTargets);
}

function attachSequenceTargets(items: SequenceItem[]) {
  for (const item of items) {
    item.targets = extractTargets(item.raw);
    if (item.kind === "if") {
      item.conditions.forEach(attachConditionTargets);
      attachSequenceTargets(item.then);
      attachSequenceTargets(item.else);
    } else if (item.kind === "choose") {
      item.choices.forEach((choice) => {
        choice.conditions.forEach(attachConditionTargets);
        attachSequenceTargets(choice.sequence);
      });
      attachSequenceTargets(item.default);
    } else if (item.kind === "repeat") {
      const repeat = asRecord(item.raw.repeat);
      item.targets = mergeTargets(
        item.targets,
        ...asList(repeat.while).map((condition) => conditionTreeTargets(condition)),
        ...asList(repeat.until).map((condition) => conditionTreeTargets(condition)),
      );
      attachSequenceTargets(item.sequence);
    } else if (item.kind === "parallel") {
      item.branches.forEach(attachSequenceTargets);
    } else if (item.kind === "sequence") {
      attachSequenceTargets(item.sequence);
    } else if (item.kind === "inline-condition") {
      attachConditionTargets(item.condition);
    } else if (item.kind === "wait" && item.waitType === "trigger") {
      item.targets = mergeTargets(item.targets, triggerListTargets(item.raw.wait_for_trigger));
    }
  }
}

function targetSummary(raw: UnknownRecord): string {
  const targets = extractTargets(raw);
  if (!targets.length) return "";
  return targets
    .map((target) => `${target.kind}: ${target.ids.join(", ")}`)
    .join(" · ");
}

const stringValue = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value : fallback;

const entityText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").join(", ");
  return "";
};

const compactValue = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(compactValue).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const record = value as UnknownRecord;
    const parts = ["hours", "minutes", "seconds"].flatMap((key) =>
      record[key] != null ? [`${key[0]}=${String(record[key])}`] : [],
    );
    return parts.length ? parts.join(" ") : JSON.stringify(value);
  }
  return String(value);
};

const durationSuffix = (value: unknown): string => {
  const duration = compactValue(value);
  return duration ? ` for ${duration}` : "";
};

const offsetSuffix = (value: unknown): string => {
  const offset = compactValue(value);
  return offset ? ` (${offset})` : "";
};

const timeWindow = (raw: UnknownRecord): string => {
  const after = compactValue(raw.after);
  const before = compactValue(raw.before);
  const weekdays = Array.isArray(raw.weekday) ? raw.weekday.map(String).join(", ") : compactValue(raw.weekday);
  const range = after && before ? `${after}–${before}` : after ? `after ${after}` : before ? `before ${before}` : "Time";
  return weekdays ? `${range} on ${weekdays}` : range;
};

function summarizeTrigger(raw: UnknownRecord): string {
  const type = stringValue(raw.trigger ?? raw.platform, "unknown");
  const entity = entityText(raw.entity_id);

  if (type === "state") {
    const from = raw.from != null ? compactValue(raw.from) : "";
    const to = raw.to != null ? compactValue(raw.to) : "";
    const transition = from && to ? `${from} → ${to}` : to ? `→ ${to}` : from ? `from ${from}` : "state changes";
    const attribute = raw.attribute != null ? ` · ${String(raw.attribute)}` : "";
    return `${entity || "Entity"}: ${transition}${attribute}${durationSuffix(raw.for)}`;
  }

  if (type === "numeric_state") {
    const parts = [
      raw.above != null ? `> ${compactValue(raw.above)}` : "",
      raw.below != null ? `< ${compactValue(raw.below)}` : "",
    ].filter(Boolean);
    return `${entity || "Entity"} ${parts.join(" and ") || "numeric state changes"}${durationSuffix(raw.for)}`;
  }

  if (type === "time") return `At ${compactValue(raw.at) || "configured time"}`;
  if (type === "time_pattern") {
    const pattern = ["hours", "minutes", "seconds"]
      .flatMap((key) => raw[key] != null ? [`${key[0]}=${compactValue(raw[key])}`] : [])
      .join(" ");
    return `Time pattern${pattern ? `: ${pattern}` : ""}`;
  }
  if (type === "sun") return `${String(raw.event ?? "sun event")}${offsetSuffix(raw.offset)}`;
  if (type === "event") return `Event: ${compactValue(raw.event_type) || "any configured event"}`;
  if (type === "template") return `Template becomes true${durationSuffix(raw.for)}`;
  if (type === "zone") return `${entity || "Entity"} ${String(raw.event ?? "enters/leaves")} ${entityText(raw.zone) || "zone"}`;
  if (type === "calendar") return `${entity || "Calendar"}: ${String(raw.event ?? "calendar event")}`;
  if (type === "mqtt") return `MQTT: ${compactValue(raw.topic) || "configured topic"}`;
  if (type === "webhook") return "Webhook received";
  if (type === "homeassistant") return `Home Assistant: ${compactValue(raw.event) || "event"}`;
  if (type === "device") {
    const domain = compactValue(raw.domain);
    const eventType = compactValue(raw.type);
    return `Device${domain || eventType ? `: ${[domain, eventType].filter(Boolean).join(" · ")}` : " trigger"}`;
  }
  const target = targetSummary(raw);
  const friendlyType = type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return target ? `${friendlyType} → ${target}` : `${friendlyType} trigger`;
}

function summarizeCondition(raw: UnknownRecord): string {
  const type = stringValue(raw.condition, "unknown");
  const entity = entityText(raw.entity_id);

  if (type === "state") {
    const attribute = raw.attribute != null ? ` · ${String(raw.attribute)}` : "";
    return `${entity || "Entity"} = ${compactValue(raw.state) || "?"}${attribute}${durationSuffix(raw.for)}`;
  }
  if (type === "numeric_state") {
    const parts = [
      raw.above != null ? `> ${compactValue(raw.above)}` : "",
      raw.below != null ? `< ${compactValue(raw.below)}` : "",
    ].filter(Boolean);
    return `${entity || "Entity"} ${parts.join(" and ") || "numeric condition"}`.trim();
  }
  if (type === "time") return timeWindow(raw);
  if (type === "sun") {
    const parts = [
      raw.after != null ? `after ${String(raw.after)}${offsetSuffix(raw.after_offset)}` : "",
      raw.before != null ? `before ${String(raw.before)}${offsetSuffix(raw.before_offset)}` : "",
    ].filter(Boolean);
    return parts.length ? `Sun: ${parts.join(" and ")}` : "Sun condition";
  }
  if (type === "template") return "Template condition";
  if (type === "trigger") return `Triggered by: ${compactValue(raw.id) || "configured trigger id"}`;
  if (type === "zone") return `${entity || "Entity"} in ${entityText(raw.zone) || "zone"}`;
  if (type === "device") {
    const domain = compactValue(raw.domain);
    const conditionType = compactValue(raw.type);
    return `Device condition${domain || conditionType ? `: ${[domain, conditionType].filter(Boolean).join(" · ")}` : ""}`;
  }
  if (["and", "or", "not"].includes(type)) return `${type.toUpperCase()} condition`;
  const target = targetSummary(raw);
  const friendlyType = type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return target ? `${friendlyType} → ${target}` : `${friendlyType} condition`;
}

function parseCondition(value: unknown, id: string, depth = 0): ConditionNode {
  assertSafeDepth(depth);
  if (typeof value === "string") {
    const raw: UnknownRecord = {
      condition: "template",
      value_template: value,
    };
    return {
      id,
      kind: "condition",
      conditionType: "template",
      summary: "Template condition",
      raw,
    };
  }

  const raw = normalizeConditionRecord(value);
  const conditionType = stringValue(raw.condition, "unknown");
  const children = ["and", "or", "not"].includes(conditionType)
    ? asList(raw.conditions).map((condition, index) => parseCondition(condition, `${id}.conditions.${index}`, depth + 1))
    : undefined;

  return {
    id,
    kind: "condition",
    conditionType,
    alias: typeof raw.alias === "string" ? raw.alias : undefined,
    summary: summarizeCondition(raw),
    raw,
    children,
  };
}

function triggerReferenceIds(value: unknown): string[] {
  return asList(value)
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim());
}

function resolveTriggerConditionSummary(condition: ConditionNode, triggersById: Map<string, TriggerNode>) {
  if (condition.conditionType === "trigger") {
    const ids = triggerReferenceIds(condition.raw.id);
    if (ids.length) {
      condition.summary = `Triggered by: ${ids.map((id) => {
        const trigger = triggersById.get(id);
        return trigger ? (trigger.alias || trigger.summary) : id;
      }).join(" / ")}`;
    }
  }
  condition.children?.forEach((child) => resolveTriggerConditionSummary(child, triggersById));
}

function resolveSequenceTriggerConditions(items: SequenceItem[], triggersById: Map<string, TriggerNode>) {
  for (const item of items) {
    if (item.kind === "if") {
      item.conditions.forEach((condition) => resolveTriggerConditionSummary(condition, triggersById));
      resolveSequenceTriggerConditions(item.then, triggersById);
      resolveSequenceTriggerConditions(item.else, triggersById);
    } else if (item.kind === "choose") {
      item.choices.forEach((choice) => {
        choice.conditions.forEach((condition) => resolveTriggerConditionSummary(condition, triggersById));
        resolveSequenceTriggerConditions(choice.sequence, triggersById);
      });
      resolveSequenceTriggerConditions(item.default, triggersById);
    } else if (item.kind === "repeat") {
      resolveSequenceTriggerConditions(item.sequence, triggersById);
    } else if (item.kind === "parallel") {
      item.branches.forEach((branch) => resolveSequenceTriggerConditions(branch, triggersById));
    } else if (item.kind === "sequence") {
      resolveSequenceTriggerConditions(item.sequence, triggersById);
    } else if (item.kind === "inline-condition") {
      resolveTriggerConditionSummary(item.condition, triggersById);
      item.summary = item.condition.summary;
    }
  }
}

const SCRIPT_CONTROL_ACTIONS = new Set([
  "script.turn_on",
  "script.turn_off",
  "script.toggle",
  "script.reload",
]);

const directScriptEntity = (action: string): string | null =>
  action.startsWith("script.") && !SCRIPT_CONTROL_ACTIONS.has(action)
    ? action
    : null;

const humanizeActionType = (value: string): string =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

function parseDeviceAction(raw: UnknownRecord, id: string, alias?: string): SequenceItem | null {
  const domain = typeof raw.domain === "string" ? raw.domain : "";
  const actionType = typeof raw.type === "string" ? raw.type : "";
  const deviceId = typeof raw.device_id === "string" ? raw.device_id : undefined;
  const entityId = typeof raw.entity_id === "string" ? raw.entity_id : undefined;

  if (!domain || !actionType || (!deviceId && !entityId)) return null;

  return {
    id,
    kind: "device-action",
    alias,
    domain,
    actionType,
    deviceId,
    entityId,
    summary: alias || humanizeActionType(actionType),
    raw,
  };
}

function parseSequence(value: unknown, prefix: string, depth = 0): SequenceItem[] {
  assertSafeDepth(depth);
  return asList(value).map((item, index) => parseSequenceItem(item, `${prefix}.${index}`, depth));
}

function parseSequenceItem(value: unknown, id: string, depth = 0): SequenceItem {
  assertSafeDepth(depth);
  const raw = asRecord(value);
  const alias = typeof raw.alias === "string" ? raw.alias : undefined;

  if (raw.if != null) {
    return {
      id,
      kind: "if",
      alias,
      summary: alias || "If / then / else",
      raw,
      conditions: asList(raw.if).map((condition, index) => parseCondition(condition, `${id}.if.${index}`, depth + 1)),
      then: parseSequence(raw.then, `${id}.then`, depth + 1),
      else: parseSequence(raw.else, `${id}.else`, depth + 1),
    };
  }

  if (raw.choose != null) {
    const choices: ChooseBranch[] = asList(raw.choose).map((choiceValue, index) => {
      const choice = asRecord(choiceValue);
      return {
        id: `${id}.choose.${index}`,
        alias: typeof choice.alias === "string" ? choice.alias : undefined,
        conditions: asList(choice.conditions).map((condition, conditionIndex) =>
          parseCondition(condition, `${id}.choose.${index}.conditions.${conditionIndex}`, depth + 1),
        ),
        sequence: parseSequence(choice.sequence, `${id}.choose.${index}.sequence`, depth + 1),
      };
    });
    return {
      id,
      kind: "choose",
      alias,
      summary: alias || `Choose (${choices.length} option${choices.length === 1 ? "" : "s"})`,
      raw,
      choices,
      default: parseSequence(raw.default, `${id}.default`, depth + 1),
    };
  }

  if (raw.repeat != null) {
    const repeat = asRecord(raw.repeat);
    const repeatType = repeat.count != null ? "count" : repeat.while != null ? "while" : repeat.until != null ? "until" : repeat.for_each != null ? "for_each" : "unknown";
    return {
      id,
      kind: "repeat",
      alias,
      summary: alias || `Repeat: ${repeatType}`,
      raw,
      repeatType,
      sequence: parseSequence(repeat.sequence, `${id}.repeat.sequence`, depth + 1),
    };
  }

  if (raw.parallel != null) {
    const branches = asList(raw.parallel).map((branch, index) => {
      const branchRecord = asRecord(branch);
      const sequence = branchRecord.sequence ?? branch;
      return parseSequence(sequence, `${id}.parallel.${index}`, depth + 1);
    });
    return { id, kind: "parallel", alias, summary: alias || `Parallel (${branches.length} branches)`, raw, branches };
  }

  if (raw.sequence != null) {
    const sequence = parseSequence(raw.sequence, `${id}.sequence`, depth + 1);
    return { id, kind: "sequence", alias, summary: alias || `Sequence (${sequence.length} step${sequence.length === 1 ? "" : "s"})`, raw, sequence };
  }

  if (raw.event != null) {
    const eventType = typeof raw.event === "string" ? raw.event : "templated event";
    return { id, kind: "event", alias, eventType, summary: alias || `Fire event: ${eventType}`, raw };
  }

  if (raw.set_conversation_response != null) {
    return { id, kind: "conversation-response", alias, summary: alias || "Set conversation response", raw };
  }

  if (raw.wait_template != null) {
    return {
      id,
      kind: "wait",
      waitType: "template",
      alias,
      summary: alias || "Wait for template",
      raw,
      timeout: raw.timeout,
      continueOnTimeout: raw.continue_on_timeout !== false,
    };
  }

  if (raw.wait_for_trigger != null) {
    return {
      id,
      kind: "wait",
      waitType: "trigger",
      alias,
      summary: alias || "Wait for trigger",
      raw,
      timeout: raw.timeout,
      continueOnTimeout: raw.continue_on_timeout !== false,
    };
  }

  if (raw.delay != null) return { id, kind: "delay", alias, summary: alias || `Delay ${String(raw.delay)}`, raw };
  if (raw.variables != null) return { id, kind: "variables", alias, summary: alias || "Set variables", raw };
  if (raw.stop != null) return { id, kind: "stop", alias, summary: alias || `Stop: ${String(raw.stop)}`, raw };

  if (raw.condition != null || raw.and != null || raw.or != null || raw.not != null) {
    const condition = parseCondition(raw, `${id}.condition`, depth + 1);
    return { id, kind: "inline-condition", alias, summary: condition.summary, raw, condition };
  }

  if (typeof raw.scene === "string" && raw.scene.trim()) {
    return {
      id,
      kind: "service",
      alias,
      action: "scene.turn_on",
      summary: alias || `Activate scene → ${raw.scene}`,
      raw,
    };
  }

  const deviceAction = parseDeviceAction(raw, id, alias);
  if (deviceAction) return deviceAction;

  const action = raw.action ?? raw.service ?? raw.service_template;
  if (typeof action === "string") {
    const target = asRecord(raw.target);
    const entity = entityText(target.entity_id ?? raw.entity_id);
    const directScript = directScriptEntity(action);
    const scriptTarget = action === "script.turn_on" ? entity : directScript;
    return {
      id,
      kind: "service",
      alias,
      action,
      summary: alias || (scriptTarget
        ? `Run script → ${scriptTarget}`
        : `${action}${entity ? ` → ${entity}` : ""}`),
      raw,
    };
  }

  return { id, kind: "unknown", alias, summary: alias || "Unsupported / unknown action", raw };
}

export function parseAutomationYaml(source: string): ParseResult {
  let document: unknown;
  try {
    document = parse(source);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Invalid YAML");
  }

  const warnings: string[] = [];
  if (Array.isArray(document)) {
    if (document.length !== 1) throw new Error("HA Lens v0.1 accepts one automation at a time.");
    document = document[0];
    warnings.push("Parsed the single automation from a YAML list.");
  }

  const raw = asRecord(document);
  if (!Object.keys(raw).length) throw new Error("The YAML does not contain an automation object.");

  const triggerValues = raw.triggers ?? raw.trigger;
  const conditionValues = raw.conditions ?? raw.condition;
  const actionValues = raw.actions ?? raw.action;

  const flattenedTriggerRecords = flattenTriggerRecords(triggerValues);
  const triggers: TriggerNode[] = flattenedTriggerRecords.map((triggerRaw, index) => {
    const triggerType = stringValue(triggerRaw.trigger ?? triggerRaw.platform, "unknown");
    return {
      id: `triggers.${index}`,
      kind: "trigger",
      triggerType,
      alias: typeof triggerRaw.alias === "string" ? triggerRaw.alias : undefined,
      summary: summarizeTrigger(triggerRaw),
      raw: triggerRaw,
    };
  });

  const automation: AutomationModel = {
    alias: stringValue(raw.alias, "Untitled automation"),
    id: typeof raw.id === "string" ? raw.id : undefined,
    description: typeof raw.description === "string" ? raw.description : undefined,
    mode: typeof raw.mode === "string" ? raw.mode : undefined,
    triggers,
    conditions: asList(conditionValues).map((condition, index) => parseCondition(condition, `conditions.${index}`)),
    actions: parseSequence(actionValues, "actions"),
    raw,
  };
  const triggersById = new Map(
    automation.triggers.flatMap((trigger) =>
      typeof trigger.raw.id === "string" && trigger.raw.id.trim()
        ? [[trigger.raw.id.trim(), trigger] as const]
        : []
    ),
  );
  automation.conditions.forEach((condition) => resolveTriggerConditionSummary(condition, triggersById));
  resolveSequenceTriggerConditions(automation.actions, triggersById);

  automation.triggers.forEach((trigger) => { trigger.targets = extractTargets(trigger.raw); });
  automation.conditions.forEach(attachConditionTargets);
  attachSequenceTargets(automation.actions);

  if (!triggers.length) warnings.push("No trigger was found. This may be a script-like sequence or manually invoked automation.");
  if (triggers.some((trigger) => isDisabled(trigger.raw))) warnings.push("One or more triggers are disabled and are excluded from execution paths.");
  if (automation.conditions.some((condition) => isDisabled(condition.raw))) warnings.push("One or more top-level conditions are disabled and are skipped during path analysis.");
  return { automation, warnings };
}


export function serializeAutomationYaml(value: unknown): string {
  return stringify(value, { lineWidth: 0 });
}
