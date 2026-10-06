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
