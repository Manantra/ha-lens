import { describe, expect, it } from "vitest";
import { buildAutomationGraph } from "@ha-lens/graph";
import { parseAutomationYaml } from "@ha-lens/parser";
import {
  buildTraceSemanticLabels,
  buildTraceBreadcrumb,
  canonicalTraceSegments,
  buildTraceCoverage,
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

  it("maps inline compound-condition children to their own semantic labels", () => {
    const { automation } = parseAutomationYaml(`
alias: Inline AND trace labels
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
actions:
  - condition: and
    conditions:
      - condition: state
        entity_id: binary_sensor.first
        state: "on"
      - condition: state
        entity_id: binary_sensor.second
        state: "on"
  - action: light.turn_on
    target:
      entity_id: light.hall
`);

    const labels = buildTraceSemanticLabels(automation);
    expect(labels.get("actions.0.condition.conditions.0")).toContain("binary_sensor.first");
    expect(labels.get("actions.0.condition.conditions.1")).toContain("binary_sensor.second");

    expect(
      tracePathToSemanticId(
        "action/0/conditions/0/entity_id/0",
        labels.keys(),
      ),
    ).toBe("actions.0.condition.conditions.0");
    expect(
      tracePathToSemanticId(
        "action/0/conditions/1/entity_id/0",
        labels.keys(),
      ),
    ).toBe("actions.0.condition.conditions.1");
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
      // Real Home Assistant choose results are reported on the action path itself.
      { path: "action/1", result: { choice: 1 } },
    ], graph);

    const tracedEdges = graph.edges.filter((edge) => edgeIds.has(edge.id));
    expect(tracedEdges.map((edge) => edge.label)).toEqual(
      expect.arrayContaining(["false", "Guests"]),
    );
  });

  it("classifies executed, untaken, and unreached graph flow conservatively", () => {
    const { automation } = parseAutomationYaml(`
alias: Last run coverage
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
    const coverage = buildTraceCoverage([
      { path: "trigger/0" },
      { path: "action/0/if", result: { result: false } },
      { path: "action/0/else/0" },
      { path: "action/1", result: { choice: 1 } },
      { path: "action/1/choose/1/sequence/0" },
    ], graph);

    expect(coverage.executedNodeIds).toContain("actions.0");
    expect(coverage.executedNodeIds).toContain("actions.0.else.0");
    expect(coverage.executedNodeIds).not.toContain("actions.0.then.0");
    expect(coverage.executedNodeIds).toContain("actions.1.choose.1.sequence.0");
    expect(coverage.executedNodeIds).not.toContain("actions.1.choose.0.sequence.0");

    const takenLabels = graph.edges
      .filter((edge) => coverage.takenEdgeIds.has(edge.id))
      .map((edge) => edge.label);
    expect(takenLabels).toEqual(expect.arrayContaining(["false", "Guests"]));

    const notTakenLabels = graph.edges
      .filter((edge) => coverage.notTakenEdgeIds.has(edge.id))
      .map((edge) => edge.label);
    expect(notTakenLabels).toEqual(expect.arrayContaining(["true", "Option 1", "No match"]));
  });

  it("reports observed repeat iterations and loop flow", () => {
    const { automation } = parseAutomationYaml(`
alias: Repeat coverage
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
actions:
  - repeat:
      count: 3
      sequence:
        - action: light.toggle
          target:
            entity_id: light.hall
  - action: notify.mobile_app_phone
    data:
      message: done
`);

    const graph = buildAutomationGraph(automation);
    const coverage = buildTraceCoverage([
      { path: "trigger/0" },
      { path: "action/0" },
      { path: "action/0/repeat/sequence/0", occurrence: 0, repeatIndex: 1 },
      { path: "action/0/repeat/sequence/0", occurrence: 1, repeatIndex: 2 },
      { path: "action/0/repeat/sequence/0", occurrence: 2, repeatIndex: 3 },
      { path: "action/1" },
    ], graph);

    expect(coverage.repeatIterationCounts.get("actions.0")).toBe(3);

    const executedLabels = graph.edges
      .filter((edge) => coverage.executedEdgeIds.has(edge.id))
      .map((edge) => edge.label)
      .filter(Boolean);
    expect(executedLabels).toEqual(expect.arrayContaining(["loop", "repeat", "continue"]));
  });

  it("keeps nested repeat and parallel runtime coverage separate", () => {
    const { automation } = parseAutomationYaml(`
alias: Nested runtime coverage
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
actions:
  - repeat:
      count: 2
      sequence:
        - parallel:
            - sequence:
                - delay: "00:00:01"
            - sequence:
                - delay: "00:00:02"
`);

    const graph = buildAutomationGraph(automation);
    const coverage = buildTraceCoverage([
      { path: "trigger/0" },
      { path: "action/0" },
      { path: "action/0/repeat/sequence/0", occurrence: 0, repeatIndex: 1 },
      { path: "action/0/repeat/sequence/0/parallel/0/sequence/0", occurrence: 0, repeatIndex: 1 },
      { path: "action/0/repeat/sequence/0/parallel/1/sequence/0", occurrence: 0, repeatIndex: 1 },
      { path: "action/0/repeat/sequence/0", occurrence: 1, repeatIndex: 2 },
      { path: "action/0/repeat/sequence/0/parallel/0/sequence/0", occurrence: 1, repeatIndex: 2 },
      { path: "action/0/repeat/sequence/0/parallel/1/sequence/0", occurrence: 1, repeatIndex: 2 },
    ], graph);

    expect(coverage.repeatIterationCounts.get("actions.0")).toBe(2);
    const parallel = coverage.parallelBranchCoverage.get("actions.0.repeat.sequence.0");
    expect(parallel?.totalBranches).toBe(2);
    expect([...parallel?.observedBranchIndexes ?? []]).toEqual([0, 1]);

    const parallelEdges = graph.edges.filter((edge) => edge.source === "actions.0.repeat.sequence.0");
    expect(parallelEdges.filter((edge) => coverage.executedEdgeIds.has(edge.id)).map((edge) => edge.label))
      .toEqual(expect.arrayContaining(["branch 1", "branch 2"]));
  });

  it("tracks observed parallel branches without calling missing branches untaken", () => {
    const { automation } = parseAutomationYaml(`
alias: Parallel coverage
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
actions:
  - parallel:
      - sequence:
          - action: light.turn_on
            target:
              entity_id: light.one
      - sequence:
          - action: light.turn_on
            target:
              entity_id: light.two
      - sequence:
          - action: light.turn_on
            target:
              entity_id: light.three
  - delay: "00:00:01"
`);

    const graph = buildAutomationGraph(automation);
    const coverage = buildTraceCoverage([
      { path: "trigger/0" },
      { path: "action/0" },
      { path: "action/0/parallel/0/sequence/0" },
      { path: "action/0/parallel/2/sequence/0" },
      { path: "action/1" },
    ], graph);

    const parallel = coverage.parallelBranchCoverage.get("actions.0");
    expect(parallel?.totalBranches).toBe(3);
    expect([...parallel?.observedBranchIndexes ?? []]).toEqual([0, 2]);

    const branchEdges = graph.edges.filter(
      (edge) => edge.source === "actions.0" && edge.label?.startsWith("branch "),
    );
    const executedBranchLabels = branchEdges
      .filter((edge) => coverage.executedEdgeIds.has(edge.id))
      .map((edge) => edge.label);
    expect(executedBranchLabels).toEqual(expect.arrayContaining(["branch 1", "branch 3"]));
    expect(executedBranchLabels).not.toContain("branch 2");

    const untakenBranchLabels = branchEdges
      .filter((edge) => coverage.notTakenEdgeIds.has(edge.id))
      .map((edge) => edge.label);
    expect(untakenBranchLabels).not.toContain("branch 2");
  });

  it("builds readable breadcrumbs for deeply nested mixed control flow", () => {
    const { automation } = parseAutomationYaml(`
alias: Runtime breadcrumb
triggers: []
actions:
  - alias: Outer loop
    repeat:
      count: 2
      sequence:
        - alias: Fan out
          parallel:
            - sequence:
                - delay: "00:00:01"
            - sequence:
                - alias: Pick scene
                  choose:
                    - alias: Night
                      conditions:
                        - condition: state
                          entity_id: input_boolean.night
                          state: "on"
                      sequence:
                        - action: scene.turn_on
                          target:
                            entity_id: scene.night
`);

    expect(buildTraceBreadcrumb(
      automation,
      "action/0/repeat/sequence/0/parallel/1/sequence/0/choose/0/sequence/0",
      2,
    )).toEqual([
      "Repeat · Outer loop · iteration 2",
      "Parallel · Fan out · Branch 2",
      "Choose · Pick scene · Night",
    ]);
  });

  it("labels nested if branches without inventing untaken context", () => {
    const { automation } = parseAutomationYaml(`
alias: If breadcrumb
triggers: []
actions:
  - alias: Presence gate
    if:
      - condition: state
        entity_id: binary_sensor.motion
        state: "on"
    then:
      - alias: Retry
        repeat:
          count: 2
          sequence:
            - delay: "00:00:01"
    else:
      - stop: no motion
`);

    expect(buildTraceBreadcrumb(
      automation,
      "action/0/then/0/repeat/sequence/0",
      1,
    )).toEqual([
      "If · Presence gate",
      "Then",
      "Repeat · Retry · iteration 1",
    ]);

    expect(buildTraceBreadcrumb(automation, "action/0/else/0")).toEqual([
      "If · Presence gate",
      "Else",
    ]);
  });

});
