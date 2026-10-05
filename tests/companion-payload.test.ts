import { describe, expect, it } from "vitest";
import {
  sanitizeAutomationReferences,
  sanitizeCompanionTrace,
  sanitizeTargetMap,
  sanitizeTargetMetadata,
  sanitizeTraceResult,
} from "../apps/web/src/companionPayload";

describe("companion payload sanitization", () => {
  it("keeps only bounded known trace result fields", () => {
    expect(sanitizeTraceResult({
      result: true,
      choice: "then",
      timeout: false,
      stop: "done",
      wait: { completed: true, secret: "drop" },
      domain: "light",
      service: "turn_on",
      huge: "x".repeat(20_000),
    })).toEqual({
      result: true,
      choice: "then",
      timeout: false,
      stop: "done",
      wait: { completed: true },
      domain: "light",
      service: "turn_on",
    });
  });

  it("caps trace paths, steps, strings, and target IDs", () => {
    const trace = sanitizeCompanionTrace({
      runId: "r".repeat(400),
      paths: Array.from({ length: 2100 }, (_, index) => `action/${index}`),
      steps: Array.from({ length: 2100 }, (_, index) => ({
        path: `action/${index}`,
        error: "e".repeat(2000),
        occurrence: index,
        repeatIndex: index + 1,
        result: { result: index % 2 === 0, arbitrary: "drop" },
        targets: { entity_id: ["light.hall"], garbage: ["drop"] },
      })),
    });
    expect(trace?.runId).toHaveLength(300);
    expect(trace?.paths).toHaveLength(2000);
    expect(trace?.steps).toHaveLength(2000);
    expect(trace?.steps?.[0].error).toHaveLength(1000);
    expect(trace?.steps?.[0].targets).toEqual({ entity_id: ["light.hall"] });
    expect(trace?.truncated).toBe(true);
  });

  it("rejects malformed traces and unknown target keys", () => {
    expect(sanitizeCompanionTrace({ paths: [] })).toBeNull();
    expect(sanitizeTargetMap({ arbitrary: ["x"] })).toBeNull();
  });

  it("bounds target metadata and related references", () => {
    const metadata = sanitizeTargetMetadata({
      area: { living: { name: "Living room" } },
    });
    expect(metadata.area.living.name).toBe("Living room");

    const references = sanitizeAutomationReferences({
      entity: ["light.hall", 123, "binary_sensor.motion"],
    });
    expect(references.entity).toEqual(["light.hall", "binary_sensor.motion"]);
  });
});
