import type { AutomationModel, ExecutionPath, PathStep, SequenceItem } from "@ha-lens/model";

interface PathState {
  steps: PathStep[];
  terminal: boolean;
  outcome?: "stopped" | "truncated";
}

const cloneWith = (state: PathState, step: PathStep): PathState => ({ ...state, steps: [...state.steps, step] });

function bounded(states: PathState[], maxPaths: number): PathState[] {
  if (states.length <= maxPaths) return states;
  return states.slice(0, maxPaths - 1).concat({
    steps: [{ nodeId: "path-limit", label: `Path expansion capped at ${maxPaths}` }],
    terminal: true,
    outcome: "truncated",
  });
}

function expandSequence(items: SequenceItem[], input: PathState[], maxPaths: number): PathState[] {
  let states = input;

  for (const item of items) {
    const next: PathState[] = [];
    for (const state of states) {
      if (state.terminal) {
        next.push(state);
        continue;
      }

      if (item.kind === "service") {
        next.push(cloneWith(state, { nodeId: item.id, label: item.summary, detail: item.action }));
      } else if (item.kind === "device-action") {
        next.push(cloneWith(state, {
          nodeId: item.id,
          label: item.summary,
          detail: `${item.domain}.${item.actionType}`,
        }));
      } else if (item.kind === "stop") {
        const stopped = cloneWith(state, { nodeId: item.id, label: item.summary });
        next.push({ ...stopped, terminal: true, outcome: "stopped" });
      } else if (item.kind === "inline-condition") {
        next.push(cloneWith(state, { nodeId: item.id, label: `${item.summary} → true` }));
        const failed = cloneWith(state, { nodeId: item.id, label: `${item.summary} → false`, detail: "Execution stops here" });
        next.push({ ...failed, terminal: true, outcome: "stopped" });
      } else if (item.kind === "if") {
        const yes = cloneWith(state, { nodeId: item.id, label: `${item.summary} → true` });
        const no = cloneWith(state, { nodeId: item.id, label: `${item.summary} → false` });
        next.push(...expandSequence(item.then, [yes], maxPaths));
        next.push(...expandSequence(item.else, [no], maxPaths));
      } else if (item.kind === "choose") {
        item.choices.forEach((choice, index) => {
          const chosen = cloneWith(state, {
            nodeId: item.id,
            label: `${item.summary} → ${choice.alias || choice.conditions.map((condition) => condition.summary).join(" · ") || `option ${index + 1}`}`,
            detail: index > 0 ? "Earlier options did not match" : undefined,
          });
          next.push(...expandSequence(choice.sequence, [chosen], maxPaths));
        });
        if (item.default.length) {
          const fallback = cloneWith(state, { nodeId: item.id, label: `${item.summary} → default`, detail: "No option matched" });
          next.push(...expandSequence(item.default, [fallback], maxPaths));
        } else {
          next.push(cloneWith(state, { nodeId: item.id, label: `${item.summary} → no match`, detail: "Continue after choose" }));
        }
      } else if (item.kind === "wait" && item.timeout != null && !item.continueOnTimeout) {
        next.push(cloneWith(state, { nodeId: item.id, label: `${item.summary} → completed` }));
        const timeout = cloneWith(state, { nodeId: item.id, label: `${item.summary} → timeout`, detail: "continue_on_timeout: false" });
        next.push({ ...timeout, terminal: true, outcome: "stopped" });
      } else if (item.kind === "repeat") {
        next.push(cloneWith(state, { nodeId: item.id, label: item.summary, detail: "Loop shown symbolically" }));
      } else if (item.kind === "parallel") {
        next.push(cloneWith(state, { nodeId: item.id, label: item.summary, detail: "Parallel branches shown symbolically" }));
      } else {
        next.push(cloneWith(state, { nodeId: item.id, label: item.summary }));
      }
    }
    states = bounded(next, maxPaths);
  }

  return states;
}

function pathTitle(state: PathState, index: number): string {
  if (state.outcome === "truncated") return "Additional paths";

  const last = state.steps.at(-1);
  if (!last) return `Path ${index + 1}`;

  if (state.outcome === "stopped") {
    const stopAt = last.label
      .replace(/\s*→\s*false$/, "")
      .replace(/\s*→\s*timeout$/, "");
    return `Stops at ${stopAt}`;
  }

  const terminalAction = [...state.steps]
    .reverse()
    .find((step) => step.detail && /^[a-z0-9_]+\.[a-z0-9_]+$/i.test(step.detail));

  if (terminalAction) return terminalAction.label;

  return `Completes: ${last.label
    .replace(/\s*→\s*true$/, "")
    .replace(/\s*→\s*completed$/, "")}`;
}

export function enumerateExecutionPaths(automation: AutomationModel, maxPaths = 64): ExecutionPath[] {
  const triggerStates: PathState[] = automation.triggers.length
    ? automation.triggers.map((trigger) => ({ steps: [{ nodeId: trigger.id, label: trigger.summary }], terminal: false }))
    : [{ steps: [{ nodeId: "manual", label: "Manual / unspecified trigger" }], terminal: false }];

  let active = triggerStates;
  const terminal: PathState[] = [];
  for (const condition of automation.conditions) {
    const nextActive: PathState[] = [];
    for (const state of active) {
      nextActive.push(cloneWith(state, { nodeId: condition.id, label: `${condition.summary} → true` }));
      const failed = cloneWith(state, { nodeId: condition.id, label: `${condition.summary} → false`, detail: "Top-level condition stops the automation" });
      terminal.push({ ...failed, terminal: true, outcome: "stopped" });
    }
    active = bounded(nextActive, maxPaths);
  }

  const expanded = expandSequence(automation.actions, active, maxPaths);
  const all = bounded([...terminal, ...expanded], maxPaths);

  return all.map((state, index) => ({
    id: `path-${index + 1}`,
    title: pathTitle(state, index),
    outcome: state.outcome ?? "completed",
    steps: state.steps,
  }));
}
