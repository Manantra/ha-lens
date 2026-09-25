import type { AutomationGraph, AutomationModel, GraphEdge, GraphNode, SequenceItem } from "@ha-lens/model";

type Incoming = { id: string; label?: string };

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

      if (item.kind === "service") {
        this.node({ id: item.id, kind: "action", label: item.summary, subtitle: item.action });
        this.connect(incoming, item.id);
        incoming = [{ id: item.id }];
      } else if (item.kind === "inline-condition") {
        this.node({ id: item.id, kind: "condition", label: item.summary });
        this.connect(incoming, item.id);
        this.stop([{ id: item.id, label: "false" }], "Condition failed");
        incoming = [{ id: item.id, label: "true" }];
      } else if (item.kind === "if") {
        this.node({ id: item.id, kind: "control", label: item.summary, subtitle: item.conditions.map((condition) => condition.summary).join(" · ") || "No conditions" });
        this.connect(incoming, item.id);
        const thenOut = item.then.length ? this.buildSequence(item.then, [{ id: item.id, label: "true" }]) : [{ id: item.id, label: "true" }];
        const elseOut = item.else.length ? this.buildSequence(item.else, [{ id: item.id, label: "false" }]) : [{ id: item.id, label: "false" }];
        const merge = this.virtual("merge", "Continue");
        this.connect(thenOut, merge);
        this.connect(elseOut, merge);
        incoming = [{ id: merge }];
      } else if (item.kind === "choose") {
        this.node({ id: item.id, kind: "control", label: item.summary, subtitle: "First matching option wins" });
        this.connect(incoming, item.id);
        const branchOut: Incoming[] = [];
        item.choices.forEach((choice, index) => {
          const conditionLabel = choice.conditions.map((condition) => condition.summary).join(" · ");
          const label = choice.alias || conditionLabel || `option ${index + 1}`;
          if (choice.sequence.length) branchOut.push(...this.buildSequence(choice.sequence, [{ id: item.id, label }]));
          else branchOut.push({ id: item.id, label });
        });
        if (item.default.length) branchOut.push(...this.buildSequence(item.default, [{ id: item.id, label: "default" }]));
        else branchOut.push({ id: item.id, label: "no match" });
        const merge = this.virtual("merge", "Continue");
        this.connect(branchOut, merge);
        incoming = [{ id: merge }];
      } else if (item.kind === "repeat") {
        this.node({ id: item.id, kind: "loop", label: item.summary, subtitle: "Symbolic loop" });
        this.connect(incoming, item.id);
        if (item.sequence.length) {
          const loopOut = this.buildSequence(item.sequence, [{ id: item.id, label: "loop" }]);
          loopOut.forEach((source) => this.edge(source.id, item.id, "repeat"));
        }
        incoming = [{ id: item.id, label: "continue" }];
      } else if (item.kind === "parallel") {
        this.node({ id: item.id, kind: "parallel", label: item.summary });
        this.connect(incoming, item.id);
        const merge = this.virtual("merge", "Join parallel branches");
        item.branches.forEach((branch, index) => {
          const out = branch.length ? this.buildSequence(branch, [{ id: item.id, label: `branch ${index + 1}` }]) : [{ id: item.id, label: `branch ${index + 1}` }];
          this.connect(out, merge);
        });
        incoming = [{ id: merge }];
      } else if (item.kind === "stop") {
        this.node({ id: item.id, kind: "stop", label: item.summary });
        this.connect(incoming, item.id);
        incoming = [];
      } else {
        const kind: GraphNode["kind"] = item.kind === "wait" ? "wait" : item.kind === "unknown" ? "unknown" : "action";
        this.node({ id: item.id, kind, label: item.summary, subtitle: item.kind === "wait" && item.timeout != null ? `timeout: ${String(item.timeout)}` : undefined });
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
      builder.node({ id: trigger.id, kind: "trigger", label: trigger.alias || trigger.summary, subtitle: trigger.triggerType });
    });
    incoming = automation.triggers.map((trigger) => ({ id: trigger.id }));
  } else {
    const manual = builder.virtual("trigger", "Manual / unspecified trigger");
    incoming = [{ id: manual }];
  }

  for (const condition of automation.conditions) {
    builder.node({ id: condition.id, kind: "condition", label: condition.alias || condition.summary, subtitle: condition.conditionType });
    builder.connect(incoming, condition.id);
    builder.stop([{ id: condition.id, label: "false" }], "Condition failed");
    incoming = [{ id: condition.id, label: "true" }];
  }

  incoming = builder.buildSequence(automation.actions, incoming);
  if (incoming.length) {
    const end = builder.virtual("end", "Completed");
    builder.connect(incoming, end);
  }

  return { nodes: builder.nodes, edges: builder.edges };
}
