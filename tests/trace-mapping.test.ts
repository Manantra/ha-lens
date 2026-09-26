import { describe, expect, it } from "vitest";
import { buildAutomationGraph } from "@ha-lens/graph";
import { parseAutomationYaml } from "@ha-lens/parser";
import {
  buildTraceSemanticLabels,
  canonicalTraceSegments,
  traceBranchEdgeIds,
  tracePathToNodeId,
  tracePathToSemanticId,
} from "../apps/web/src/traceMapping";

describe("Home Assistant trace mapping", () => {
  it("normalizes real nested if-condition trace paths", () => {
    const path = "action/1/then/4/if/condition/0/entity_id/0";

    expect(canonicalTraceSegments(path)).toEqual([
      "actions", "1", "then", "4", "if", "0", "entity_id", "0",
    ]);
    expect(tracePathToSemanticId(path, ["actions.1.then.4.if.0"])).toBe(
      "actions.1.then.4.if.0",
    );
    expect(tracePathToNodeId(path, ["actions.1.then.4"])).toBe(
      "actions.1.then.4",
    );
  });

  it("normalizes Home Assistant parallel branch sequence paths", () => {
    const path = "action/2/parallel/1/sequence/0";

    expect(canonicalTraceSegments(path)).toEqual([
      "actions", "2", "parallel", "1", "0",
    ]);
    expect(tracePathToNodeId(path, ["actions.2", "actions.2.parallel.1.0"])).toBe(
      "actions.2.parallel.1.0",
    );
  });

  it("keeps choose sequence paths mapped to their concrete action", () => {
    const path = "action/0/choose/1/sequence/2";
    expect(tracePathToNodeId(path, ["actions.0", "actions.0.choose.1.sequence.2"])).toBe(
      "actions.0.choose.1.sequence.2",
    );
  });

  it("builds semantic labels for hidden if conditions", () => {
    const { automation } = parseAutomationYaml(`
alias: Nested trace labels
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
actions:
  - if:
      - condition: numeric_state
        entity_id: sensor.lux
        below: 20
    then:
      - action: light.turn_on
        target:
          entity_id: light.hall
`);

    const labels = buildTraceSemanticLabels(automation);
    expect(labels.get("actions.0.if.0")).toContain("sensor.lux");
    expect(
      tracePathToSemanticId(
        "action/0/if/condition/0/entity_id/0",
        labels.keys(),
      ),
    ).toBe("actions.0.if.0");
  });

  it("marks the taken if and choose branch edges from trace results", () => {
    const { automation } = parseAutomationYaml(`
alias: Branch coverage
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
actions:
  - if:
      - condition: state
        entity_id: input_boolean.away
        state: "on"
    then:
      - action: light.turn_off
        target:
          entity_id: light.hall
    else:
      - action: light.turn_on
        target:
          entity_id: light.hall
  - choose:
      - conditions:
          - condition: state
            entity_id: input_boolean.night
            state: "on"
        sequence:
          - action: scene.turn_on
            target:
              entity_id: scene.night
      - alias: Guests
        conditions:
          - condition: state
            entity_id: input_boolean.guests
            state: "on"
        sequence:
          - action: scene.turn_on
            target:
              entity_id: scene.guests
`);

    const graph = buildAutomationGraph(automation);
    const edgeIds = traceBranchEdgeIds([
      { path: "action/0/if", result: { result: false } },
      { path: "action/1/choose", result: { choice: 1 } },
    ], graph);

    const tracedEdges = graph.edges.filter((edge) => edgeIds.has(edge.id));
    expect(tracedEdges.map((edge) => edge.label)).toEqual(
      expect.arrayContaining(["false", "Guests"]),
    );
  });
});
