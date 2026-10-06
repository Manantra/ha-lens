import { getEnablementState } from "@ha-lens/model";
import type { AutomationGraph, AutomationModel, GraphEdge, GraphNode, SequenceItem, UnknownRecord } from "@ha-lens/model";

type Incoming = { id: string; label?: string };

function enablementProps(raw: UnknownRecord): Pick<GraphNode, "disabled" | "dynamicEnabled"> {
  const state = getEnablementState(raw);
  return {
    disabled: state === "disabled",
    dynamicEnabled: state === "dynamic",
  };
}

function conditionEnablementLabel(raw: UnknownRecord, summary: string): string {
  const state = getEnablementState(raw);
  if (state === "disabled") return `[disabled] ${summary}`;
  if (state === "dynamic") return `[runtime enabled] ${summary}`;
  return summary;
}

function metadataSubtitle(raw: UnknownRecord, base?: string): string | undefined {
  const parts = base ? [base] : [];
  if (typeof raw.note === "string" && raw.note.trim()) {
    const note = raw.note.trim();
    parts.push(`Note: ${note.length > 72 ? `${note.slice(0, 69)}…` : note}`);
  }
  if (raw.continue_on_error === true) parts.push("Continue on error");
  if (typeof raw.response_variable === "string" && raw.response_variable.trim()) {
    parts.push(`Response → ${raw.response_variable.trim()}`);
  }
  return parts.length ? parts.join(" · ") : undefined;
}

class Builder {
  nodes: GraphNode[] = [];
  edges: GraphEdge[] = [];
  private edgeCounter = 0;
  private virtualCounter = 0;

  node(node: GraphNode) {
    if (!this.nodes.some((item) => item.id === node.id)) this.nodes.push(node);
    return node.id;
  }

  edge(source: string, target: string, label?: string) {
    this.edges.push({ id: `edge-${++this.edgeCounter}`, source, target, label });
  }

  connect(incoming: Incoming[], target: string) {
    incoming.forEach((source) => this.edge(source.id, target, source.label));
  }

  virtual(kind: GraphNode["kind"], label: string) {
    const id = `virtual-${++this.virtualCounter}`;
    this.node({ id, kind, label });
    return id;
  }

  stop(incoming: Incoming[], label = "Stop") {
    const id = this.virtual("stop", label);
    this.connect(incoming, id);
  }

  buildSequence(items: SequenceItem[], initial: Incoming[]): Incoming[] {
    let incoming = initial;
    for (const item of items) {
      if (!incoming.length) break;

      if (getEnablementState(item.raw) === "disabled") {
        const disabledKind: GraphNode["kind"] = item.kind === "inline-condition"
          ? "condition"
          : item.kind === "if" || item.kind === "choose"
            ? "control"
            : item.kind === "repeat"
              ? "loop"
              : item.kind === "parallel"
                ? "parallel"
                : item.kind === "wait"
                  ? "wait"
                  : item.kind === "stop"
                    ? "stop"
                    : item.kind === "unknown"
                      ? "unknown"
                      : "action";
        this.node({ id: item.id, kind: disabledKind, label: item.summary, subtitle: metadataSubtitle(item.raw, "Disabled in Home Assistant"), disabled: true });
        this.connect(incoming, item.id);
        incoming = [{ id: item.id, label: "disabled / skipped" }];
        continue;
      }

      if (item.kind === "service") {
        this.node({ id: item.id, kind: "action", label: item.summary, subtitle: metadataSubtitle(item.raw, item.action), ...enablementProps(item.raw) });
        this.connect(incoming, item.id);
        incoming = [{ id: item.id }];
      } else if (item.kind === "device-action") {
        this.node({
          id: item.id,
          kind: "action",
          label: item.summary,
          subtitle: metadataSubtitle(item.raw, `Device action · ${item.domain}`),
          ...enablementProps(item.raw),
        });
        this.connect(incoming, item.id);
        incoming = [{ id: item.id }];
      } else if (item.kind === "inline-condition") {
        this.node({ id: item.id, kind: "condition", label: item.summary, subtitle: metadataSubtitle(item.raw), ...enablementProps(item.raw) });
        this.connect(incoming, item.id);
        this.stop([{ id: item.id, label: "false" }], "Condition failed");
        incoming = [{ id: item.id, label: "true" }];
      } else if (item.kind === "if") {
        this.node({ id: item.id, kind: "control", label: item.summary, subtitle: metadataSubtitle(item.raw, item.conditions.map((condition) => conditionEnablementLabel(condition.raw, condition.summary)).join(" · ") || "No conditions"), ...enablementProps(item.raw) });
        this.connect(incoming, item.id);
        const thenOut = item.then.length ? this.buildSequence(item.then, [{ id: item.id, label: "true" }]) : [{ id: item.id, label: "true" }];
        const elseOut = item.else.length ? this.buildSequence(item.else, [{ id: item.id, label: "false" }]) : [{ id: item.id, label: "false" }];
        const merge = this.virtual("merge", "Continue");
        this.connect(thenOut, merge);
        this.connect(elseOut, merge);
        incoming = [{ id: merge }];
      } else if (item.kind === "choose") {
        this.node({ id: item.id, kind: "control", label: item.summary, subtitle: metadataSubtitle(item.raw, "First matching option wins"), ...enablementProps(item.raw) });
        this.connect(incoming, item.id);
        const branchOut: Incoming[] = [];
        item.choices.forEach((choice, index) => {
          const label = choice.alias || `Option ${index + 1}`;
          if (choice.sequence.length) branchOut.push(...this.buildSequence(choice.sequence, [{ id: item.id, label }]));
          else branchOut.push({ id: item.id, label });
        });
        if (item.default.length) branchOut.push(...this.buildSequence(item.default, [{ id: item.id, label: "Default" }]));
        else branchOut.push({ id: item.id, label: "No match" });
        const merge = this.virtual("merge", "Continue");
        this.connect(branchOut, merge);
        incoming = [{ id: merge }];
      } else if (item.kind === "repeat") {
        this.node({ id: item.id, kind: "loop", label: item.summary, subtitle: metadataSubtitle(item.raw, "Symbolic loop"), ...enablementProps(item.raw) });
        this.connect(incoming, item.id);
        if (item.sequence.length) {
          const loopOut = this.buildSequence(item.sequence, [{ id: item.id, label: "loop" }]);
          loopOut.forEach((source) => this.edge(source.id, item.id, "repeat"));
        }
        incoming = [{ id: item.id, label: "continue" }];
      } else if (item.kind === "parallel") {
        this.node({ id: item.id, kind: "parallel", label: item.summary, subtitle: metadataSubtitle(item.raw), ...enablementProps(item.raw) });
        this.connect(incoming, item.id);
        const merge = this.virtual("merge", "Join parallel branches");
        item.branches.forEach((branch, index) => {
          const out = branch.length ? this.buildSequence(branch, [{ id: item.id, label: `branch ${index + 1}` }]) : [{ id: item.id, label: `branch ${index + 1}` }];
          this.connect(out, merge);
        });
        incoming = [{ id: merge }];
      } else if (item.kind === "sequence") {
        this.node({ id: item.id, kind: "control", label: item.summary, subtitle: metadataSubtitle(item.raw, "Nested sequence"), ...enablementProps(item.raw) });
        this.connect(incoming, item.id);
        incoming = item.sequence.length ? this.buildSequence(item.sequence, [{ id: item.id }]) : [{ id: item.id }];
      } else if (item.kind === "event") {
        this.node({ id: item.id, kind: "action", label: item.summary, subtitle: metadataSubtitle(item.raw, `Event · ${item.eventType}`), ...enablementProps(item.raw) });
        this.connect(incoming, item.id);
        incoming = [{ id: item.id }];
      } else if (item.kind === "conversation-response") {
        this.node({ id: item.id, kind: "action", label: item.summary, subtitle: metadataSubtitle(item.raw, "Conversation response"), ...enablementProps(item.raw) });
        this.connect(incoming, item.id);
        incoming = [{ id: item.id }];
      } else if (item.kind === "stop") {
        this.node({ id: item.id, kind: "stop", label: item.summary, subtitle: metadataSubtitle(item.raw, item.raw.error === true ? "Stops with error" : undefined), ...enablementProps(item.raw) });
        this.connect(incoming, item.id);
        incoming = [];
      } else {
        const kind: GraphNode["kind"] = item.kind === "wait" ? "wait" : item.kind === "unknown" ? "unknown" : "action";
        this.node({ id: item.id, kind, label: item.summary, subtitle: metadataSubtitle(item.raw, item.kind === "wait" && item.timeout != null ? `timeout: ${String(item.timeout)}` : undefined), ...enablementProps(item.raw) });
        this.connect(incoming, item.id);
        if (item.kind === "wait" && item.timeout != null && !item.continueOnTimeout) this.stop([{ id: item.id, label: "timeout" }], "Timeout");
        incoming = [{ id: item.id, label: item.kind === "wait" && item.timeout != null ? "completed" : undefined }];
      }
    }
    return incoming;
  }
}

export function buildAutomationGraph(automation: AutomationModel): AutomationGraph {
  const builder = new Builder();
  let incoming: Incoming[] = [];

  if (automation.triggers.length) {
    automation.triggers.forEach((trigger) => {
      builder.node({ id: trigger.id, kind: "trigger", label: trigger.alias || trigger.summary, subtitle: metadataSubtitle(trigger.raw, trigger.triggerType), ...enablementProps(trigger.raw) });
    });
    incoming = automation.triggers.map((trigger) => ({ id: trigger.id }));
  } else {
    const manual = builder.virtual("trigger", "Manual / unspecified trigger");
    incoming = [{ id: manual }];
  }

  for (const condition of automation.conditions) {
    const enablement = getEnablementState(condition.raw);
    const disabled = enablement === "disabled";
    builder.node({ id: condition.id, kind: "condition", label: condition.alias || condition.summary, subtitle: metadataSubtitle(condition.raw, condition.conditionType), ...enablementProps(condition.raw) });
    builder.connect(incoming, condition.id);
    if (disabled) {
      incoming = [{ id: condition.id, label: "disabled / skipped" }];
    } else {
      builder.stop([{ id: condition.id, label: "false" }], "Condition failed");
      incoming = [{ id: condition.id, label: "true" }];
    }
  }

  incoming = builder.buildSequence(automation.actions, incoming);
  if (incoming.length) {
    const end = builder.virtual("end", "Completed");
    builder.connect(incoming, end);
  }

  return { nodes: builder.nodes, edges: builder.edges };
}
