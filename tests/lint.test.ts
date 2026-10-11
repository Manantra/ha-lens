import { describe, expect, it } from "vitest";
import { parseAutomationYaml } from "@ha-lens/parser";
import { lintAutomation } from "../apps/web/src/lint";

function lint(yaml: string) {
  return lintAutomation(parseAutomationYaml(yaml).automation);
}

describe("optional HA Lens lint", () => {
  it("reports a manual-only automation as informational, not invalid", () => {
    const issues = lint(`
alias: Manual only
triggers: []
actions:
  - delay: 1
`);
    expect(issues).toContainEqual(expect.objectContaining({ ruleId: "HAL001", severity: "info" }));
    expect(issues.some((issue) => issue.severity === "warning")).toBe(false);
  });

  it("reports statically disabled triggers and actions", () => {
    const issues = lint(`
alias: Disabled
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
    enabled: false
actions:
  - delay: 1
    enabled: false
`);
    expect(issues.map((issue) => issue.ruleId)).toEqual(expect.arrayContaining(["HAL002", "HAL004"]));
  });

  it("does not claim a templated enabled block is disabled", () => {
    const issues = lint(`
alias: Dynamic
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
    enabled: "{{ is_state('input_boolean.guard', 'on') }}"
actions:
  - delay: 1
`);
    expect(issues).toContainEqual(expect.objectContaining({ ruleId: "HAL005", severity: "info" }));
    expect(issues.some((issue) => issue.ruleId === "HAL002")).toBe(false);
  });

  it("flags only statically guaranteed sibling reachability after stop", () => {
    const issues = lint(`
alias: Stop
triggers: []
actions:
  - stop: done
  - action: light.turn_on
    target:
      entity_id: light.hall
`);
    expect(issues).toContainEqual(expect.objectContaining({ ruleId: "HAL006", severity: "warning" }));

    const dynamicStop = lint(`
alias: Dynamic stop
triggers: []
actions:
  - stop: maybe
    enabled: "{{ condition }}"
  - delay: 1
`);
    expect(dynamicStop.some((issue) => issue.ruleId === "HAL006")).toBe(false);
  });

  it("mirrors Home Assistant 2026.10 trigger-reference diagnostics conservatively", () => {
    const issues = lint(`
alias: Trigger references
triggers:
  - trigger: state
    entity_id: binary_sensor.one
    id: shared
  - trigger: state
    entity_id: binary_sensor.two
    id: shared
conditions:
  - condition: trigger
    id:
      - shared
      - missing-id
actions:
  - delay: 1
`);

    expect(issues).toContainEqual(expect.objectContaining({
      ruleId: "HAL009",
      severity: "info",
      title: "Shared trigger ID",
    }));
    expect(issues).toContainEqual(expect.objectContaining({
      ruleId: "HAL010",
      severity: "warning",
      nodeId: "conditions.0",
    }));
  });

  it("flags state-duration combinations Home Assistant 2026.10 now rejects", () => {
    const attribute = lint(`
alias: State attribute duration
triggers: []
conditions:
  - condition: state
    entity_id: light.hall
    attribute: brightness
    state: "100"
    for: "00:01:00"
actions: []
`);
    expect(attribute).toContainEqual(expect.objectContaining({ ruleId: "HAL011", nodeId: "conditions.0" }));

    const list = lint(`
alias: State list duration
triggers: []
conditions:
  - condition: state
    entity_id: binary_sensor.motion
    state: ["on", "off"]
    for: "00:01:00"
actions: []
`);
    expect(list).toContainEqual(expect.objectContaining({ ruleId: "HAL011" }));

    const inputEntity = lint(`
alias: Dynamic state duration
triggers: []
conditions:
  - condition: state
    entity_id: light.hall
    state: input_select.expected_state
    for: "00:01:00"
actions: []
`);
    expect(inputEntity).toContainEqual(expect.objectContaining({ ruleId: "HAL011" }));

    const valid = lint(`
alias: Valid state duration
triggers: []
conditions:
  - condition: state
    entity_id: binary_sensor.motion
    state: ["on"]
    for: "00:01:00"
actions: []
`);
    expect(valid.some((issue) => issue.ruleId === "HAL011")).toBe(false);
  });

  it("describes unknown syntax as a HA Lens modeling limitation", () => {
    const issues = lint(`
alias: Future syntax
triggers: []
actions:
  - future_action:
      value: 1
`);
    const issue = issues.find((candidate) => candidate.ruleId === "HAL007");
    expect(issue?.detail).toMatch(/Home Assistant may support/i);
  });
});
