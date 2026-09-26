import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeAutomation } from "@ha-lens/analyzer";
import { buildAutomationGraph } from "@ha-lens/graph";
import { automationGraphToMermaid } from "@ha-lens/exporter";
import { parseAutomationYaml } from "@ha-lens/parser";
import { enumerateExecutionPaths } from "@ha-lens/paths";

function fixtureFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? fixtureFiles(path) : /\.ya?ml$/i.test(entry.name) ? [path] : [];
  });
}

const fixtureDirectory = fileURLToPath(new URL("../fixtures", import.meta.url));

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

  it("extracts common Home Assistant template entity references", () => {
    const { automation } = parseAutomationYaml(`
alias: Templates
triggers:
  - trigger: template
    value_template: "{{ is_state('person.alex', 'home') }}"
conditions:
  - condition: template
    value_template: >
      {{ states.sensor.lux.state | float < 20
         and has_value('sensor.outdoor_temperature')
         and is_state_attr('climate.office', 'hvac_action', 'heating') }}
actions:
  - action: light.turn_on
    target:
      entity_id: light.hall
    data:
      brightness_pct: "{{ states('input_number.hall_brightness') | int }}"
`);
    const analysis = analyzeAutomation(automation);
    expect(analysis.entities).toEqual(expect.arrayContaining([
      "person.alex",
      "sensor.lux",
      "sensor.outdoor_temperature",
      "climate.office",
      "input_number.hall_brightness",
      "light.hall",
    ]));
  });

  it("parses every checked-in fixture without losing the graph", () => {
    const fixtures = fixtureFiles(fixtureDirectory);
    expect(fixtures.length).toBeGreaterThanOrEqual(5);

    for (const file of fixtures) {
      const { automation } = parseAutomationYaml(readFileSync(file, "utf8"));
      const graph = buildAutomationGraph(automation);
      expect(graph.nodes.length, file).toBeGreaterThan(0);
    }
  });

  it("enumerates stopped and completed paths", () => {
    const { automation } = parseAutomationYaml(yaml);
    const paths = enumerateExecutionPaths(automation);
    expect(paths.some((path) => path.outcome === "stopped")).toBe(true);
    expect(paths.filter((path) => path.outcome === "completed").length).toBeGreaterThanOrEqual(2);
    expect(paths.some((path) => path.title.includes("light.turn_on"))).toBe(true);
    expect(paths.some((path) => path.title.startsWith("Stops at "))).toBe(true);
  });

  it("produces readable trigger and condition summaries", () => {
    const { automation } = parseAutomationYaml(`
alias: Readable
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
    from: "off"
    to: "on"
    for: "00:00:05"
conditions:
  - condition: time
    after: "22:00:00"
    before: "06:00:00"
    weekday: [mon, tue, wed, thu, fri]
actions: []
`);
    expect(automation.triggers[0].summary).toContain("off → on");
    expect(automation.triggers[0].summary).toContain("00:00:05");
    expect(automation.conditions[0].summary).toContain("22:00:00–06:00:00");
    expect(automation.conditions[0].summary).toContain("mon");
  });

  it("uses choose conditions as branch labels when aliases are missing", () => {
    const { automation } = parseAutomationYaml(`
alias: Choose labels
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
actions:
  - choose:
      - conditions:
          - condition: state
            entity_id: input_boolean.guest_mode
            state: "on"
        sequence:
          - action: light.turn_on
            target:
              entity_id: light.hall
`);
    const graph = buildAutomationGraph(automation);
    expect(graph.edges.some((edge) => edge.label?.includes("input_boolean.guest_mode"))).toBe(true);
  });



  it("uses concise human-readable trigger contexts for entity focus", () => {
    const { automation } = parseAutomationYaml(`
alias: Trigger usage
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
    from: "off"
    to: "on"
  - trigger: state
    entity_id: binary_sensor.motion
    from: "on"
    to: "off"
actions: []
`);
    const analysis = analyzeAutomation(automation);

    expect(analysis.entityUsageDetails["binary_sensor.motion"]).toEqual([
      { nodeId: "triggers.0", context: "Trigger 1 · State off → on" },
      { nodeId: "triggers.1", context: "Trigger 2 · State on → off" },
    ]);
  });

  it("maps nested entity references to visible graph nodes with readable contexts", () => {
    const { automation } = parseAutomationYaml(`
alias: Nested usage
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
actions:
  - choose:
      - conditions:
          - condition: numeric_state
            entity_id: sensor.lux
            below: 50
        sequence:
          - action: light.turn_on
            target:
              entity_id: light.hall
      - conditions:
          - condition: state
            entity_id: input_boolean.guest_mode
            state: "on"
        sequence: []
`);
    const analysis = analyzeAutomation(automation);

    expect(analysis.entityUsages["sensor.lux"]).toEqual(["actions.0"]);
    expect(analysis.entityUsageDetails["sensor.lux"]).toEqual([
      {
        nodeId: "actions.0",
        context: "Choose (2 options) → Option 1 → Numeric state condition",
      },
    ]);
    expect(analysis.entityUsages["light.hall"]).toEqual(["actions.0.choose.0.sequence.0"]);
  });

  it("exports graph structure as Mermaid", () => {
    const { automation } = parseAutomationYaml(yaml);
    const graph = buildAutomationGraph(automation);
    const mermaid = automationGraphToMermaid(graph, automation.alias);
    expect(mermaid).toContain("flowchart TD");
    expect(mermaid).toContain("light.turn_on");
    expect(mermaid).toContain("-->|\"true\"|");
  });

  it("builds a graph with branch labels", () => {
    const { automation } = parseAutomationYaml(yaml);
    const graph = buildAutomationGraph(automation);
    expect(graph.nodes.some((node) => node.kind === "control")).toBe(true);
    expect(graph.edges.some((edge) => edge.label === "true")).toBe(true);
    expect(graph.edges.some((edge) => edge.label === "false")).toBe(true);
  });
});
