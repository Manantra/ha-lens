import { describe, expect, it } from "vitest";
import { buildAutomationGraph } from "@ha-lens/graph";
import { parseAutomationYaml } from "@ha-lens/parser";
import { buildAutomationDiff } from "../apps/web/src/automationDiff";

function diff(before: string, after: string) {
  const baseline = parseAutomationYaml(before).automation;
  const current = parseAutomationYaml(after).automation;
  return buildAutomationDiff(
    baseline,
    current,
    buildAutomationGraph(baseline),
    buildAutomationGraph(current),
  );
}

describe("automation diff", () => {
  it("marks configuration changes on the same semantic action as changed", () => {
    const result = diff(
      `
alias: Hall
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
actions:
  - action: light.turn_on
    target:
      entity_id: light.hall
    data:
      brightness_pct: 20
`,
      `
alias: Hall
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
actions:
  - action: light.turn_on
    target:
      entity_id: light.hall
    data:
      brightness_pct: 60
`,
    );

    expect(result.stats).toMatchObject({ added: 0, removed: 0, changed: 1 });
    expect(result.nodeStates.get("actions.0")).toBe("changed");
    expect(result.changes.some((change) => change.detail?.includes("data"))).toBe(true);
  });

  it("does not turn an insertion into a cascade of false changes", () => {
    const result = diff(
      `
alias: Hall
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
actions:
  - action: light.turn_on
    target:
      entity_id: light.hall
  - action: notify.mobile_app_phone
`,
      `
alias: Hall
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
actions:
  - delay: "00:00:01"
  - action: light.turn_on
    target:
      entity_id: light.hall
  - action: notify.mobile_app_phone
`,
    );

    expect(result.stats.added).toBe(1);
    expect(result.stats.removed).toBe(0);
    expect(result.stats.changed).toBe(0);
    expect(result.nodeStates.get("actions.0")).toBe("added");
    expect(result.nodeStates.has("actions.1")).toBe(false);
    expect(result.nodeStates.has("actions.2")).toBe(false);
  });

  it("keeps removed nodes visible in the merged diff graph", () => {
    const result = diff(
      `
alias: Hall
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
actions:
  - action: light.turn_on
    target:
      entity_id: light.hall
  - delay: "00:00:02"
  - action: light.turn_off
    target:
      entity_id: light.hall
`,
      `
alias: Hall
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
actions:
  - action: light.turn_on
    target:
      entity_id: light.hall
  - action: light.turn_off
    target:
      entity_id: light.hall
`,
    );

    expect(result.stats.removed).toBe(1);
    expect(result.graph.nodes.some((node) => node.id === "diff-removed:actions.1")).toBe(true);
    expect(result.nodeStates.get("diff-removed:actions.1")).toBe("removed");
  });

  it("compares nested choose branches without changing the whole branch sequence", () => {
    const result = diff(
      `
alias: Choose
triggers: []
actions:
  - choose:
      - alias: Night
        conditions:
          - condition: state
            entity_id: input_boolean.night
            state: "on"
        sequence:
          - action: light.turn_on
            target:
              entity_id: light.hall
            data:
              brightness_pct: 20
`,
      `
alias: Choose
triggers: []
actions:
  - choose:
      - alias: Night
        conditions:
          - condition: state
            entity_id: input_boolean.night
            state: "on"
        sequence:
          - action: light.turn_on
            target:
              entity_id: light.hall
            data:
              brightness_pct: 70
`,
    );

    expect(result.nodeStates.get("actions.0.choose.0.sequence.0")).toBe("changed");
    expect(result.nodeStates.has("actions.0")).toBe(false);
  });

  it("reports automation metadata changes separately", () => {
    const result = diff(
      `
alias: Before
mode: single
triggers: []
actions: []
`,
      `
alias: After
mode: restart
triggers: []
actions: []
`,
    );

    expect(result.stats.changed).toBe(2);
    expect(result.metadataChanges.map((change) => change.label)).toEqual(["Alias", "Mode"]);
  });
});

describe("automation diff Home Assistant 2026 compatibility", () => {
  it("ignores Home Assistant generated trigger IDs but reports manual ID changes", () => {
    const generated = diff(
      `
alias: Trigger IDs
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
actions: []
`,
      `
alias: Trigger IDs
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
    id: generated-a3Xz
actions: []
`,
    );
    expect(generated.stats.added).toBe(0);
    expect(generated.stats.removed).toBe(0);
    expect(generated.stats.changed).toBe(0);

    const manual = diff(
      `
alias: Trigger IDs
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
    id: motion-old
actions: []
`,
      `
alias: Trigger IDs
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
    id: motion-new
actions: []
`,
    );
    expect(manual.stats.added).toBe(0);
    expect(manual.stats.removed).toBe(0);
    expect(manual.stats.changed).toBe(1);
    expect(manual.nodeStates.get("triggers.0")).toBe("changed");
  });

  it("reports runtime-affecting top-level metadata changes", () => {
    const result = diff(
      `
alias: Metadata
mode: parallel
max: 2
variables:
  level: 1
triggers: []
actions: []
`,
      `
alias: Metadata
mode: parallel
max: 10
variables:
  level: 2
triggers: []
actions: []
`,
    );
    expect(result.metadataChanges.map((change) => change.label)).toEqual(expect.arrayContaining(["Max", "Variables"]));
    expect(result.stats.changed).toBe(2);
  });

  it("diffs nested sequence children independently", () => {
    const result = diff(
      `
alias: Sequence diff
triggers: []
actions:
  - sequence:
      - delay: "00:00:01"
      - action: light.turn_on
        target:
          entity_id: light.hall
`,
      `
alias: Sequence diff
triggers: []
actions:
  - sequence:
      - delay: "00:00:02"
      - action: light.turn_on
        target:
          entity_id: light.hall
`,
    );
    expect(result.nodeStates.get("actions.0.sequence.0")).toBe("changed");
    expect(result.nodeStates.has("actions.0")).toBe(false);
  });
});
