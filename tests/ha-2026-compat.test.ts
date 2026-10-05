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

describe("Home Assistant 2026 targets and action types", () => {
  it("extracts entity, device, area, floor, and label targets", () => {
    const { automation } = parseAutomationYaml(`
alias: Purpose-specific targets
triggers:
  - trigger: motion
    target:
      area_id: living_room
      floor_id: ground_floor
actions:
  - action: light.turn_on
    target:
      entity_id: light.ceiling
      device_id: device-123
      label_id:
        - accent_lights
`);
    const analysis = analyzeAutomation(automation);
    expect(analysis.targets).toEqual([
      { kind: "entity", ids: ["light.ceiling"] },
      { kind: "device", ids: ["device-123"] },
      { kind: "area", ids: ["living_room"] },
      { kind: "floor", ids: ["ground_floor"] },
      { kind: "label", ids: ["accent_lights"] },
    ]);
    expect(automation.triggers[0].summary).toContain("area: living_room");
  });

  it("parses nested sequence, event, conversation response, and service_template actions", () => {
    const { automation } = parseAutomationYaml(`
alias: New action forms
actions:
  - sequence:
      - event: ha_lens_test
        event_data:
          value: 1
      - set_conversation_response: "Done"
      - service_template: "{{ 'light.turn_on' }}"
        target:
          entity_id: light.hall
`);

    expect(automation.actions[0].kind).toBe("sequence");
    if (automation.actions[0].kind !== "sequence") throw new Error("expected sequence");
    expect(automation.actions[0].sequence.map((item) => item.kind)).toEqual([
      "event",
      "conversation-response",
      "service",
    ]);

    const graph = buildAutomationGraph(automation);
    expect(graph.nodes.some((node) => node.id === "actions.0.sequence.0" && node.kind === "action")).toBe(true);
    const paths = enumerateExecutionPaths(automation);
    expect(paths[0].steps.map((step) => step.nodeId)).toEqual(expect.arrayContaining([
      "actions.0",
      "actions.0.sequence.0",
      "actions.0.sequence.1",
      "actions.0.sequence.2",
    ]));
  });
});
