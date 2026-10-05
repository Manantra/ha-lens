import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeAutomation, explainAutomation } from "@ha-lens/analyzer";
import { buildAutomationGraph } from "@ha-lens/graph";
import { parseAutomationYaml } from "@ha-lens/parser";
import { enumerateExecutionPaths } from "@ha-lens/paths";

describe("Home Assistant 2026 automation compatibility", () => {
  it("resolves 2026.10 generated Triggered by IDs to readable trigger labels", () => {
    const { automation } = parseAutomationYaml(`
alias: Trigger references
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
    to: "on"
    id: generated-a3Xz
    alias: Motion detected
conditions:
  - condition: trigger
    id: generated-a3Xz
actions:
  - if:
      - condition: trigger
        id:
          - generated-a3Xz
          - missing-reference
    then:
      - delay: "00:00:01"
`);

    expect(automation.conditions[0].summary).toBe("Triggered by: Motion detected");
    const block = automation.actions[0];
    if (block.kind !== "if") throw new Error("expected if");
    expect(block.conditions[0].summary).toBe("Triggered by: Motion detected / missing-reference");
  });

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

  it("normalizes condition-list and inline logical shorthand", () => {
    const { automation } = parseAutomationYaml(`
alias: Shorthand conditions
conditions:
  - condition:
      - condition: state
        entity_id: input_boolean.a
        state: "on"
      - condition: state
        entity_id: input_boolean.b
        state: "on"
actions:
  - or:
      - condition: state
        entity_id: input_boolean.c
        state: "on"
      - condition: state
        entity_id: input_boolean.d
        state: "on"
`);

    expect(automation.conditions[0].conditionType).toBe("and");
    expect(automation.conditions[0].children).toHaveLength(2);
    expect(automation.actions[0].kind).toBe("inline-condition");
    if (automation.actions[0].kind !== "inline-condition") throw new Error("expected inline condition");
    expect(automation.actions[0].condition.conditionType).toBe("or");
    expect(automation.actions[0].condition.children).toHaveLength(2);
  });

  it("does not report templated target strings as concrete IDs", () => {
    const { automation } = parseAutomationYaml(`
alias: Dynamic target
actions:
  - action: light.turn_on
    target:
      entity_id: "{{ target_light }}"
      area_id: "{{ target_area }}"
`);
    const analysis = analyzeAutomation(automation);
    expect(analysis.targets).toEqual([]);
    expect(analysis.entities).not.toContain("{{ target_light }}");
  });

  it("rejects pathological nesting before the browser stack is exhausted", () => {
    let action: unknown = { delay: "00:00:01" };
    for (let index = 0; index < 70; index += 1) action = { sequence: [action] };
    const source = JSON.stringify({ alias: "Too deep", triggers: [], actions: [action] });
    expect(() => parseAutomationYaml(source)).toThrow(/nesting exceeds HA Lens safety limit/);
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

  it("keeps purpose-specific conditions readable without hard-coding integration types", () => {
    const { automation } = parseAutomationYaml(`
alias: Purpose-specific condition
conditions:
  - condition: occupancy
    target:
      area_id: living_room
      label_id: occupied_spaces
actions: []
`);

    expect(automation.conditions[0].conditionType).toBe("occupancy");
    expect(automation.conditions[0].summary).toContain("Occupancy");
    expect(automation.conditions[0].summary).toContain("area: living_room");
    expect(automation.conditions[0].summary).toContain("label: occupied_spaces");
    expect(analyzeAutomation(automation).targets).toEqual([
      { kind: "area", ids: ["living_room"] },
      { kind: "label", ids: ["occupied_spaces"] },
    ]);
  });

  it("surfaces action notes error policy response variables and error stops", () => {
    const { automation } = parseAutomationYaml(`
alias: Action metadata
actions:
  - action: weather.get_forecasts
    target:
      entity_id: weather.home
    response_variable: forecast
    continue_on_error: true
    note: Keep going if forecast lookup fails
  - stop: Forecast failed
    error: true
`);

    const graph = buildAutomationGraph(automation);
    const service = graph.nodes.find((node) => node.id === "actions.0");
    expect(service?.subtitle).toContain("Continue on error");
    expect(service?.subtitle).toContain("Response → forecast");
    expect(service?.subtitle).toContain("Note: Keep going if forecast lookup fails");
    const stop = graph.nodes.find((node) => node.id === "actions.1");
    expect(stop?.subtitle).toContain("Stops with error");

    const analysis = analyzeAutomation(automation);
    expect(analysis.insights.some((insight) => insight.nodeId === "actions.0" && insight.message.includes("continue"))).toBe(true);
    expect(analysis.insights.some((insight) => insight.nodeId === "actions.0" && insight.message.includes("forecast"))).toBe(true);
    expect(analysis.insights.some((insight) => insight.nodeId === "actions.1" && insight.level === "warning")).toBe(true);
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

describe("Home Assistant companion 2026 trace contract", () => {
  it("reads resolved service targets from result.params.target with legacy fallback", () => {
    const panel = readFileSync("custom_components/ha_lens/frontend/ha-lens-panel.js", "utf8");
    expect(panel).toContain("entry?.result?.params?.target ?? entry?.result?.target");
    expect(panel).toContain('type: "automation/config"');
    expect(panel).toContain('type: "search/related"');
    expect(panel).toContain('type: "config/floor_registry/list"');
    expect(panel).toContain('type: "config/label_registry/list"');
    expect(panel).toContain("targetMetadata");
    expect(panel).toContain("_relatedWithRuntimeTargets");
    expect(panel).toContain("entry?.result?.params?.target ?? entry?.result?.target");
    expect(panel).toContain("summary?.not_triggered !== true");
    expect(panel).toContain("summary?.not_triggered === true");
    expect(panel).not.toContain("ordered.slice(0, 12)");
  });
});
