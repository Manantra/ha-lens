export type TargetIdKey = "entity_id" | "device_id" | "area_id" | "floor_id" | "label_id";
export type TargetMap = Partial<Record<TargetIdKey, string[]>>;

export type CompanionTargetMetadata = Record<string, Record<string, { name?: string | null }>>;

export interface CompanionTraceStep {
  path: string;
  occurrence?: number;
  repeatIndex?: number | null;
  timestamp?: string | null;
  error?: string | null;
  result?: unknown;
  targets?: TargetMap | null;
}

export interface CompanionTrace {
  runId: string;
  state?: string | null;
  scriptExecution?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastStep?: string | null;
  error?: string | null;
  notTriggered?: boolean;
  truncated?: boolean;
  paths: string[];
  steps?: CompanionTraceStep[];
}

const TARGET_KEYS: TargetIdKey[] = ["entity_id", "device_id", "area_id", "floor_id", "label_id"];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" ? value.slice(0, maxLength) : null;
}

function boundedInteger(value: unknown, min: number, max: number): number | undefined {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max
    ? Number(value)
    : undefined;
}

export function sanitizeTargetMap(value: unknown): TargetMap | null {
  const source = record(value);
  if (!source) return null;

  const output: TargetMap = {};
  for (const key of TARGET_KEYS) {
    const raw = source[key];
    if (!Array.isArray(raw)) continue;
    const values = raw
      .filter((item): item is string => typeof item === "string")
      .slice(0, 500)
      .map((item) => item.slice(0, 300));
    if (values.length) output[key] = values;
  }
  return Object.keys(output).length ? output : null;
}

export function sanitizeTraceResult(value: unknown): unknown {
  if (["string", "number", "boolean"].includes(typeof value)) {
    return typeof value === "string" ? value.slice(0, 300) : value;
  }
  const source = record(value);
  if (!source) return null;

  const output: Record<string, unknown> = {};
  if (typeof source.result === "boolean") output.result = source.result;
  if (["string", "number", "boolean"].includes(typeof source.choice)) {
    output.choice = typeof source.choice === "string" ? source.choice.slice(0, 160) : source.choice;
  }
  if (typeof source.timeout === "boolean") output.timeout = source.timeout;
  if (["string", "number", "boolean"].includes(typeof source.stop)) {
    output.stop = typeof source.stop === "string" ? source.stop.slice(0, 300) : source.stop;
  }
  if (["string", "number", "boolean"].includes(typeof source.delay)) {
    output.delay = typeof source.delay === "string" ? source.delay.slice(0, 160) : source.delay;
  }
  const wait = record(source.wait);
  if (typeof wait?.completed === "boolean") output.wait = { completed: wait.completed };
  if (typeof source.domain === "string") output.domain = source.domain.slice(0, 120);
  if (typeof source.service === "string") output.service = source.service.slice(0, 120);
  const target = sanitizeTargetMap(source.target);
  if (target) output.target = target;
  return Object.keys(output).length ? output : null;
}

export function sanitizeCompanionTrace(value: unknown): CompanionTrace | null {
  const source = record(value);
  if (!source) return null;
  const runId = boundedString(source.runId, 300);
  if (!runId) return null;

  const rawPaths = Array.isArray(source.paths) ? source.paths : [];
  const paths = rawPaths
    .filter((path): path is string => typeof path === "string")
    .slice(0, 2000)
    .map((path) => path.slice(0, 500));

  const rawSteps = Array.isArray(source.steps) ? source.steps : [];
  const steps: CompanionTraceStep[] = [];
  for (const rawStep of rawSteps.slice(0, 2000)) {
    const step = record(rawStep);
    if (!step) continue;
    const path = boundedString(step.path, 500);
    if (!path) continue;
    const occurrence = boundedInteger(step.occurrence, 0, 100_000);
    const repeatIndex = step.repeatIndex == null
      ? null
      : boundedInteger(step.repeatIndex, 1, 100_000) ?? null;
    steps.push({
      path,
      ...(occurrence == null ? {} : { occurrence }),
      repeatIndex,
      timestamp: boundedString(step.timestamp, 120),
      error: boundedString(step.error, 1000),
      result: sanitizeTraceResult(step.result),
      targets: sanitizeTargetMap(step.targets),
    });
  }

  return {
    runId,
    state: boundedString(source.state, 120),
    scriptExecution: boundedString(source.scriptExecution, 120),
    startedAt: boundedString(source.startedAt, 120),
    finishedAt: boundedString(source.finishedAt, 120),
    lastStep: boundedString(source.lastStep, 500),
    error: boundedString(source.error, 1000),
    notTriggered: Boolean(source.notTriggered),
    truncated: Boolean(source.truncated || rawPaths.length > 2000 || rawSteps.length > 2000),
    paths,
    steps,
  };
}

export function sanitizeAutomationReferences(value: unknown): Record<string, string[]> {
  const source = record(value);
  if (!source) return {};
  return Object.fromEntries(
    Object.entries(source)
      .slice(0, 20)
      .map(([key, ids]) => [
        key.slice(0, 80),
        Array.isArray(ids)
          ? ids.filter((id): id is string => typeof id === "string").slice(0, 5000).map((id) => id.slice(0, 300))
          : [],
      ]),
  );
}

export function sanitizeTargetMetadata(value: unknown): CompanionTargetMetadata {
  const source = record(value);
  if (!source) return {};
  return Object.fromEntries(
    Object.entries(source).slice(0, 10).map(([kind, rawValues]) => {
      const values = record(rawValues);
      return [
        kind.slice(0, 80),
        values
          ? Object.fromEntries(Object.entries(values).slice(0, 5000).map(([id, rawValue]) => {
              const item = record(rawValue);
              return [id.slice(0, 300), { name: boundedString(item?.name, 300) }];
            }))
          : {},
      ];
    }),
  );
}
