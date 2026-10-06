import { describe, expect, it } from "vitest";
import {
  createAutomationSnapshot,
  MAX_SNAPSHOT_YAML_LENGTH,
  parseAutomationSnapshot,
  serializeAutomationSnapshot,
  snapshotFilename,
} from "../apps/web/src/snapshot";

describe("HA Lens snapshots", () => {
  it("round-trips only the local automation source and minimal snapshot metadata", () => {
    const yaml = "alias: Hall\\nactions:\\n  - delay: 1\\n";
    const snapshot = createAutomationSnapshot(yaml, "Hall", new Date("2026-10-06T18:00:00Z"));
    const serialized = serializeAutomationSnapshot(snapshot);
    const parsed = parseAutomationSnapshot(serialized);

    expect(parsed).toEqual(snapshot);
    expect(serialized).not.toContain("trace");
    expect(serialized).not.toContain("entityMetadata");
    expect(serialized).not.toContain("targetMetadata");
  });

  it("rejects unknown schemas instead of guessing", () => {
    expect(() => parseAutomationSnapshot(JSON.stringify({
      schema: "ha-lens.snapshot.v99",
      automation: { yaml: "alias: nope" },
    }))).toThrow(/Unsupported/);
  });

  it("rejects snapshots without YAML and oversized automation content", () => {
    expect(() => parseAutomationSnapshot(JSON.stringify({
      schema: "ha-lens.snapshot.v1",
      automation: { alias: "Missing" },
    }))).toThrow(/automation YAML/i);

    expect(() => createAutomationSnapshot("x".repeat(MAX_SNAPSHOT_YAML_LENGTH + 1), "Huge"))
      .toThrow(/too large/i);
  });

  it("creates filesystem-safe deterministic filenames", () => {
    expect(snapshotFilename("Wohnzimmer: Licht / Nachtmodus")).toBe("wohnzimmer-licht-nachtmodus.ha-lens.json");
  });
});
