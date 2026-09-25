# Architecture

HA Lens deliberately separates Home Assistant semantics from rendering. The browser UI never parses YAML directly into XYFlow nodes.

```text
YAML -> parser -> semantic model -> analyzer / path engine / graph builder -> UI
```

## Packages

### `@ha-lens/model`
Shared semantic types. Control-flow nodes are Home Assistant aware but renderer agnostic.

### `@ha-lens/parser`
Normalizes singular/plural Home Assistant keys (`trigger`/`triggers`, `condition`/`conditions`, `action`/`actions`) and converts supported script syntax into semantic nodes. New/unknown syntax degrades to an `unknown` node instead of failing the full automation.

### `@ha-lens/analyzer`
Collects statistics, static entity references, action calls, and factual structural insights. It does not attempt to decide whether an automation is logically "good" or "bad".

### `@ha-lens/paths`
Enumerates mutually exclusive control-flow outcomes with a hard cap. Loops and parallel blocks are symbolic in v0.1 to avoid false claims and combinatorial explosion.

### `@ha-lens/graph`
Builds renderer-neutral nodes and edges. The React app handles layout separately with ELK.

## Design rules

1. Read-only by default.
2. Never execute an automation.
3. Never claim to evaluate runtime-dependent templates statically.
4. Preserve unsupported syntax visibly.
5. Prefer factual insights over lint-style opinion.
6. Keep core packages independent from React so a future HACS panel can reuse them.
