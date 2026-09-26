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

  it("uses compact choose option labels when aliases are missing", () => {
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
      - alias: Guests
        conditions:
          - condition: state
            entity_id: input_boolean.party_mode
            state: "on"
        sequence:
          - action: light.turn_off
            target:
              entity_id: light.hall
`);
    const graph = buildAutomationGraph(automation);
    expect(graph.edges.some((edge) => edge.label === "Option 1")).toBe(true);
    expect(graph.edges.some((edge) => edge.label === "Guests")).toBe(true);
    expect(graph.edges.some((edge) => edge.label === "No match")).toBe(true);
    expect(graph.edges.some((edge) => edge.label?.includes("input_boolean.guest_mode"))).toBe(false);
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



  it("supports scene shortcut actions and string template conditions", () => {
    const { automation } = parseAutomationYaml(`
alias: Hallway scenes
triggers:
  - platform: state
    entity_id: binary_sensor.motion
    from: "off"
    to: "on"
actions:
  - choose:
      - conditions:
          - "{{ scene_morning != 'scene.none' }}"
          - condition: time
            after: "05:00:00"
            before: "08:00:00"
        sequence:
          - scene: scene.flur_morgens
      - conditions:
          - "{{ scene_evening != 'scene.none' }}"
        sequence:
          - scene: scene.flur_abends
    default:
      - action: light.turn_on
        target:
          area_id: flur
`);

    const choose = automation.actions[0];
    expect(choose.kind).toBe("choose");
    if (choose.kind !== "choose") throw new Error("Expected choose action");

    expect(choose.choices[0].conditions[0].conditionType).toBe("template");
    expect(choose.choices[0].conditions[0].summary).toBe("Template condition");

    const sceneAction = choose.choices[0].sequence[0];
    expect(sceneAction.kind).toBe("service");
    if (sceneAction.kind !== "service") throw new Error("Expected normalized scene service action");
    expect(sceneAction.action).toBe("scene.turn_on");
    expect(sceneAction.summary).toBe("Activate scene → scene.flur_morgens");

    const graph = buildAutomationGraph(automation);
    expect(graph.nodes.some((node) => node.kind === "unknown")).toBe(false);
    expect(graph.nodes.some((node) => node.label === "Activate scene → scene.flur_morgens")).toBe(true);

    const analysis = analyzeAutomation(automation);
    expect(analysis.actions).toContain("scene.turn_on");
    expect(analysis.entities).toEqual(expect.arrayContaining(["scene.flur_morgens", "scene.flur_abends"]));
  });


  it("renders direct and targeted script calls as script runs", () => {
    const { automation } = parseAutomationYaml(`
alias: Script calls
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
    to: "on"
actions:
  - action: script.good_night
    data:
      source: hallway
  - action: script.turn_on
    target:
      entity_id: script.welcome_home
    data:
      variables:
        greeting: hello
`);

    const direct = automation.actions[0];
    const targeted = automation.actions[1];
    expect(direct.kind).toBe("service");
    expect(targeted.kind).toBe("service");
    if (direct.kind !== "service" || targeted.kind !== "service") {
      throw new Error("Expected service actions");
    }

    expect(direct.action).toBe("script.good_night");
    expect(direct.summary).toBe("Run script → script.good_night");
    expect(targeted.action).toBe("script.turn_on");
    expect(targeted.summary).toBe("Run script → script.welcome_home");

    const graph = buildAutomationGraph(automation);
    expect(graph.nodes.some((node) => node.label === "Run script → script.good_night")).toBe(true);
    expect(graph.nodes.some((node) => node.label === "Run script → script.welcome_home")).toBe(true);

    const analysis = analyzeAutomation(automation);
    expect(analysis.entities).toEqual(expect.arrayContaining([
      "script.good_night",
      "script.welcome_home",
    ]));
    expect(analysis.entityUsages["script.good_night"]).toEqual([direct.id]);
    expect(analysis.entityUsages["script.welcome_home"]).toEqual([targeted.id]);
  });

  it("parses Home Assistant device actions as supported actions", () => {
    const { automation } = parseAutomationYaml(`
alias: Lock door
triggers:
  - trigger: numeric_state
    entity_id: zone.home
    below: 1
actions:
  - device_id: 848332cb3e1e578fd22c2233e
    domain: lock
    entity_id: 147d91f90416f5849d4affeb6
    type: lock
`);

    const item = automation.actions[0];
    expect(item.kind).toBe("device-action");
    if (item.kind !== "device-action") throw new Error("Expected device action");
    expect(item.domain).toBe("lock");
    expect(item.actionType).toBe("lock");
    expect(item.summary).toBe("Lock");

    const graph = buildAutomationGraph(automation);
    const actionNode = graph.nodes.find((node) => node.id === item.id);
    expect(actionNode?.kind).toBe("action");
    expect(actionNode?.label).toBe("Lock");
    expect(actionNode?.subtitle).toBe("Device action · lock");
    expect(graph.nodes.some((node) => node.kind === "unknown")).toBe(false);

    const analysis = analyzeAutomation(automation);
    expect(analysis.actions).toContain("lock.lock [device]");
    expect(analysis.entityUsages["147d91f90416f5849d4affeb6"]).toEqual([item.id]);

    const paths = enumerateExecutionPaths(automation);
    expect(paths.some((path) => path.steps.some((step) => step.label === "Lock" && step.detail === "lock.lock"))).toBe(true);
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
