import { describe, expect, it } from "vitest";
import { analyzeAutomation, explainAutomation } from "@ha-lens/analyzer";
import { buildAutomationGraph } from "@ha-lens/graph";
import { parseAutomationYaml } from "@ha-lens/parser";
import { enumerateExecutionPaths } from "@ha-lens/paths";

describe("Home Assistant 2026 automation compatibility", () => {
  it("flattens nested trigger-list wrappers into Home Assistant runtime leaf order", () => {
    const { automation } = parseAutomationYaml(`
alias: Trigger lists
triggers:
  - triggers:
      - trigger: state
        entity_id: binary_sensor.one
      - triggers:
          - trigger: time
            at: "12:00:00"
          - trigger: event
            event_type: ha_lens_test
        alias: nested wrapper
actions:
  - delay: "00:00:01"
`);

    expect(automation.triggers.map((trigger) => trigger.id)).toEqual([
      "triggers.0",
      "triggers.1",
      "triggers.2",
    ]);
    expect(automation.triggers.map((trigger) => trigger.triggerType)).toEqual([
      "state",
      "time",
      "event",
    ]);
  });

  it("keeps disabled elements visible but excludes them from execution paths", () => {
    const { automation } = parseAutomationYaml(`
alias: Disabled semantics
triggers:
  - trigger: state
    entity_id: binary_sensor.disabled
    enabled: false
  - trigger: state
    entity_id: binary_sensor.enabled
conditions:
  - condition: state
    entity_id: input_boolean.skip_me
    state: "on"
    enabled: false
actions:
  - stop: disabled stop
    enabled: false
  - action: light.turn_on
    target:
      entity_id: light.hall
`);

    const paths = enumerateExecutionPaths(automation);
    expect(paths).toHaveLength(1);
    const ids = paths[0].steps.map((step) => step.nodeId);
    expect(ids).toContain("triggers.1");
    expect(ids).toContain("actions.1");
    expect(ids).not.toContain("triggers.0");
    expect(ids).not.toContain("conditions.0");
    expect(ids).not.toContain("actions.0");

    const graph = buildAutomationGraph(automation);
    expect(graph.nodes.find((node) => node.id === "triggers.0")?.disabled).toBe(true);
    expect(graph.nodes.find((node) => node.id === "conditions.0")?.disabled).toBe(true);
    expect(graph.nodes.find((node) => node.id === "actions.0")?.disabled).toBe(true);

    const analysis = analyzeAutomation(automation);
    expect(analysis.insights.some((insight) => insight.nodeId === "actions.0" && insight.message.includes("disabled"))).toBe(true);
    expect(explainAutomation(automation).some((line) => line.includes("disabled in Home Assistant"))).toBe(true);
  });

  it("normalizes logical condition shorthand", () => {
    const { automation } = parseAutomationYaml(`
alias: Condition shorthand
conditions:
  - and:
      - condition: state
        entity_id: input_boolean.a
        state: "on"
      - or:
          - condition: state
            entity_id: input_boolean.b
            state: "on"
          - not:
              - condition: state
                entity_id: input_boolean.c
                state: "off"
actions: []
`);

    const root = automation.conditions[0];
    expect(root.conditionType).toBe("and");
    expect(root.children?.[1].conditionType).toBe("or");
    expect(root.children?.[1].children?.[1].conditionType).toBe("not");
    expect(root.children?.[1].children?.[1].children?.[0].conditionType).toBe("state");
  });
});
