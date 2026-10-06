export const SNAPSHOT_SCHEMA = "ha-lens.snapshot.v1";
export const MAX_SNAPSHOT_YAML_LENGTH = 2_000_000;
export const MAX_SNAPSHOT_FILE_BYTES = 2_500_000;

export interface HaLensSnapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  createdAt: string;
  automation: {
    alias: string;
    yaml: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanAlias(value: unknown): string {
  if (typeof value !== "string") return "Automation snapshot";
  const trimmed = value.trim();
  return trimmed.slice(0, 300) || "Automation snapshot";
}

export function createAutomationSnapshot(yaml: string, alias: string, now = new Date()): HaLensSnapshot {
  if (yaml.length > MAX_SNAPSHOT_YAML_LENGTH) throw new Error("Automation YAML is too large for a HA Lens snapshot.");
  return {
    schema: SNAPSHOT_SCHEMA,
    createdAt: now.toISOString(),
    automation: {
      alias: cleanAlias(alias),
      yaml,
    },
  };
}

export function serializeAutomationSnapshot(snapshot: HaLensSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function parseAutomationSnapshot(source: string): HaLensSnapshot {
  if (new TextEncoder().encode(source).byteLength > MAX_SNAPSHOT_FILE_BYTES) {
    throw new Error("Snapshot file is too large.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Snapshot is not valid JSON.");
  }

  if (!isRecord(parsed) || parsed.schema !== SNAPSHOT_SCHEMA) {
    throw new Error("Unsupported HA Lens snapshot format.");
  }
  if (!isRecord(parsed.automation) || typeof parsed.automation.yaml !== "string") {
    throw new Error("Snapshot does not contain automation YAML.");
  }
  if (parsed.automation.yaml.length > MAX_SNAPSHOT_YAML_LENGTH) {
    throw new Error("Automation YAML is too large for a HA Lens snapshot.");
  }

  const createdAt = typeof parsed.createdAt === "string" && Number.isFinite(Date.parse(parsed.createdAt))
    ? parsed.createdAt
    : new Date(0).toISOString();

  return {
    schema: SNAPSHOT_SCHEMA,
    createdAt,
    automation: {
      alias: cleanAlias(parsed.automation.alias),
      yaml: parsed.automation.yaml,
    },
  };
}

export function snapshotFilename(alias: string): string {
  const slug = cleanAlias(alias)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .toLowerCase();
  return `${slug || "automation"}.ha-lens.json`;
}
