import { parse } from "yaml";
import type {
  AutomationModel,
  ChooseBranch,
  ConditionNode,
  ParseResult,
  SequenceItem,
  TriggerNode,
  UnknownRecord,
} from "@ha-lens/model";

const asRecord = (value: unknown): UnknownRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};

const asList = <T = unknown>(value: unknown): T[] => {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]) as T[];
};

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
  return `${type} trigger`;
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
  return `${type} condition`;
}

function parseCondition(value: unknown, id: string): ConditionNode {
  const raw = asRecord(value);
  const conditionType = stringValue(raw.condition, "unknown");
  const children = ["and", "or", "not"].includes(conditionType)
    ? asList(raw.conditions).map((condition, index) => parseCondition(condition, `${id}.conditions.${index}`))
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

function parseSequence(value: unknown, prefix: string): SequenceItem[] {
  return asList(value).map((item, index) => parseSequenceItem(item, `${prefix}.${index}`));
}

function parseSequenceItem(value: unknown, id: string): SequenceItem {
  const raw = asRecord(value);
  const alias = typeof raw.alias === "string" ? raw.alias : undefined;

  if (raw.if != null) {
    return {
      id,
      kind: "if",
      alias,
      summary: alias || "If / then / else",
      raw,
      conditions: asList(raw.if).map((condition, index) => parseCondition(condition, `${id}.if.${index}`)),
      then: parseSequence(raw.then, `${id}.then`),
      else: parseSequence(raw.else, `${id}.else`),
    };
  }

  if (raw.choose != null) {
    const choices: ChooseBranch[] = asList(raw.choose).map((choiceValue, index) => {
      const choice = asRecord(choiceValue);
      return {
        id: `${id}.choose.${index}`,
        alias: typeof choice.alias === "string" ? choice.alias : undefined,
        conditions: asList(choice.conditions).map((condition, conditionIndex) =>
          parseCondition(condition, `${id}.choose.${index}.conditions.${conditionIndex}`),
        ),
        sequence: parseSequence(choice.sequence, `${id}.choose.${index}.sequence`),
      };
    });
    return {
      id,
      kind: "choose",
      alias,
      summary: alias || `Choose (${choices.length} option${choices.length === 1 ? "" : "s"})`,
      raw,
      choices,
      default: parseSequence(raw.default, `${id}.default`),
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
      sequence: parseSequence(repeat.sequence, `${id}.repeat.sequence`),
    };
  }

  if (raw.parallel != null) {
    const branches = asList(raw.parallel).map((branch, index) => {
      const branchRecord = asRecord(branch);
      const sequence = branchRecord.sequence ?? branch;
      return parseSequence(sequence, `${id}.parallel.${index}`);
    });
    return { id, kind: "parallel", alias, summary: alias || `Parallel (${branches.length} branches)`, raw, branches };
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

  if (raw.condition != null) {
    const condition = parseCondition(raw, `${id}.condition`);
    return { id, kind: "inline-condition", alias, summary: condition.summary, raw, condition };
  }

  const action = raw.action ?? raw.service;
  if (typeof action === "string") {
    const target = asRecord(raw.target);
    const entity = entityText(target.entity_id ?? raw.entity_id);
    return {
      id,
      kind: "service",
      alias,
      action,
      summary: alias || `${action}${entity ? ` → ${entity}` : ""}`,
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

  const triggers: TriggerNode[] = asList(triggerValues).map((trigger, index) => {
    const triggerRaw = asRecord(trigger);
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

  if (!triggers.length) warnings.push("No trigger was found. This may be a script-like sequence or manually invoked automation.");
  return { automation, warnings };
}
