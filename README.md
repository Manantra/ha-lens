# HA Lens

**Understand every path through your Home Assistant automation.**

HA Lens is a read-only visualizer and analyzer for Home Assistant automations. It turns automation YAML into a semantic flow graph, execution paths, entity/action inventory, structural insights, deterministic explanations, and—inside Home Assistant—a view of the latest runtime trace.

> Current stable companion release: **v0.1.35**. Current prerelease: **v0.1.36-beta.1**, adding readable nested runtime breadcrumbs. v0.1.35 focuses on Home Assistant 2026 compatibility and security hardening. HA Lens remains intentionally read-only: it analyzes automations but does not execute or modify them.

## Why HA Lens?

Visual flow editors are great for *building* automations. HA Lens is deliberately different: it is an inspection, explanation, documentation, presentation, and debugging aid for automations that already exist.

- Visualize triggers, conditions, `if`, `choose`, nested sequences, waits, repeats, parallel blocks, events, scenes, scripts, device actions, and service calls.
- Explore bounded possible execution paths without touching Home Assistant.
- See referenced entities, actions, and modern Home Assistant entity/device/area/floor/label targets in one place, including common Jinja helper and dotted-state references.
- Render Home Assistant's own resolved entity icons in entity cards and directly on graph nodes, with local fallback glyphs only when Home Assistant cannot resolve an icon.
- Click an entity to highlight its graph usage and see nested usage context.
- Surface factual structural insights without pretending valid YAML is an error.
- Inspect the latest Home Assistant execution trace with chronological runtime steps, resolved targets, results, errors, and graph highlighting. Trigger checks that did not start the automation are shown separately and never masquerade as an execution.
- Switch between **Structure** and **Last run** to see executed flow, explicit branch-not-taken decisions, and parts of the graph that were not reached.
- Compare the current local YAML against a captured baseline in the **Diff** tab: added, changed, and removed nodes are shown both in a change list and directly in the graph. Removed baseline nodes remain visible only for comparison.
- See observed repeat iteration counts (for example **3 iterations**) and observed parallel branch coverage (for example **3/3 branches**) from the latest Home Assistant trace.
- Collapse the Automation YAML panel when a large graph needs more room.
- Switch between **Fit all** for overview and **Fit width** for larger, more readable nodes.
- Export the current automation map as SVG or high-resolution PNG.
- Copy Mermaid flowchart code for GitHub READMEs, wikis, and documentation.
- Use Presentation Mode for tutorials, screenshots, videos, and documentation.
- Keep unknown/new Home Assistant syntax visible instead of crashing.

## Quick start

```bash
npm ci
npm run dev
```

Then open the Vite URL shown in your terminal.

Run the full local quality gate with:

```bash
npm run check
```

## Project structure

```text
apps/web          React + XYFlow UI
packages/model    semantic types
packages/parser   YAML -> semantic automation model
packages/analyzer stats, entities, actions, insights
packages/paths    bounded execution-path expansion
packages/graph    semantic model -> graph nodes/edges
packages/exporter graph -> documentation/export formats
fixtures          real-world-ish YAML examples
tests             parser/analyzer/path tests
custom_components Home Assistant / HACS companion
```

## Home Assistant companion

The repository includes a read-only HACS-compatible custom integration under `custom_components/ha_lens`. It adds an admin-only HA Lens panel to the Home Assistant sidebar. Automations are listed from Home Assistant state; only the selected automation is fetched through the official `automation/config` WebSocket command, while `search/related` and local registries provide entity/device/area/floor/label context. The latest real execution and the latest not-triggered diagnostic are loaded separately when available.

No write action is registered. The compiled visualizer is bundled into the integration, so the Home Assistant companion does not depend on GitHub Pages at runtime.

See [`docs/hacs-companion.md`](docs/hacs-companion.md) for installation, architecture, privacy notes, and current limitations.

## Supported automation structure

The parser recognizes top-level and nested trigger lists, boolean and templated runtime `enabled` states, logical-condition shorthands, `if/then/else`, `choose/default`, nested `sequence`, inline conditions, delays, waits, repeat variants, parallel branches, variables, stop, event actions, conversation responses, scene shortcuts, direct/targeted script calls, device actions, normal/service-template actions, and purpose-specific Home Assistant targets.

Unsupported constructs become `unknown` nodes and remain visible.

Path expansion is intentionally bounded and symbolic around loops and parallel execution. HA Lens does not statically execute Jinja templates or emulate Home Assistant runtime state.

See [`docs/support-matrix.md`](docs/support-matrix.md) for the current support matrix and deliberate limitations.

## Deployment

### GitHub Pages standalone build

The repository includes a GitHub Pages workflow for the standalone public demo. In the repository, **Settings → Pages → Build and deployment** must use **GitHub Actions** as the source.

The Home Assistant companion does **not** require GitHub Pages: HACS installs a locally bundled viewer under `custom_components/ha_lens/frontend/app`.

## Roadmap

The Home Assistant 2026 compatibility and security-hardening pass is complete in v0.1.35. The next development focus is:

- additional runtime-label polish for unusually deep mixed control flow
- read-only snapshots
- optional lint rules

See [`ROADMAP.md`](ROADMAP.md) for the detailed checklist.

## Privacy

The standalone app is designed to work entirely client-side. Your automation YAML is not sent to a HA Lens backend.

The companion passes only the selected automation plus bounded metadata/trace data to a locally bundled **sandboxed** viewer. Parent/child messages use a per-panel random nonce and the viewer validates and caps incoming payloads. HA Lens does not expose a Home Assistant token to the viewer and does not require an external service for analysis.

## Contributing

Issues and pull requests are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md); never post Home Assistant secrets or credentials in examples.

## License

MIT
