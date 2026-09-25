import { describe, expect, it } from "vitest";
import { analyzeAutomation } from "@ha-lens/analyzer";
import { buildAutomationGraph } from "@ha-lens/graph";
import { parseAutomationYaml } from "@ha-lens/parser";
import { enumerateExecutionPaths } from "@ha-lens/paths";

const yaml = `
alias: Test
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
    to: "on"
conditions:
  - condition: numeric_state
    entity_id: sensor.lux
    below: 10
actions:
  - if:
      - condition: state
        entity_id: person.someone
        state: home
    then:
      - action: light.turn_on
        target:
          entity_id: light.hall
    else:
      - action: notify.mobile_app_phone
`;

describe("HA Lens core", () => {
  it("parses and normalizes a Home Assistant automation", () => {
    const { automation } = parseAutomationYaml(yaml);
    expect(automation.alias).toBe("Test");
    expect(automation.triggers).toHaveLength(1);
    expect(automation.conditions).toHaveLength(1);
    expect(automation.actions[0].kind).toBe("if");
  });

  it("extracts entities and action calls", () => {
    const { automation } = parseAutomationYaml(yaml);
    const analysis = analyzeAutomation(automation);
    expect(analysis.entities).toContain("light.hall");
    expect(analysis.actions).toContain("light.turn_on");
  });

  it("enumerates stopped and completed paths", () => {
    const { automation } = parseAutomationYaml(yaml);
    const paths = enumerateExecutionPaths(automation);
    expect(paths.some((path) => path.outcome === "stopped")).toBe(true);
    expect(paths.filter((path) => path.outcome === "completed").length).toBeGreaterThanOrEqual(2);
    expect(paths.some((path) => path.title.includes("light.turn_on"))).toBe(true);
    expect(paths.some((path) => path.title.startsWith("Stops at "))).toBe(true);
  });

  it("builds a graph with branch labels", () => {
    const { automation } = parseAutomationYaml(yaml);
    const graph = buildAutomationGraph(automation);
    expect(graph.nodes.some((node) => node.kind === "control")).toBe(true);
    expect(graph.edges.some((edge) => edge.label === "true")).toBe(true);
    expect(graph.edges.some((edge) => edge.label === "false")).toBe(true);
  });
});
