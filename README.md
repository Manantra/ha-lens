# HA Lens

**Understand every path through your Home Assistant automation.**

HA Lens is a read-only visualizer and analyzer for Home Assistant automations. It turns automation YAML into a semantic flow graph, execution paths, entity/action inventory, structural insights, deterministic explanations, and—inside Home Assistant—a view of the latest runtime trace.

> Current stable companion release: **v0.1.28**. HA Lens remains intentionally read-only: it analyzes automations but does not execute or modify them.

## Why HA Lens?

Visual flow editors are great for *building* automations. HA Lens is deliberately different: it is an inspection, explanation, documentation, presentation, and debugging aid for automations that already exist.

- Visualize triggers, conditions, `if`, `choose`, waits, repeats, parallel blocks, scenes, scripts, device actions, and service calls.
- Explore bounded possible execution paths without touching Home Assistant.
- See referenced entities and actions in one place, including common Jinja helper and dotted-state references.
- Click an entity to highlight its graph usage and see nested usage context.
- Surface factual structural insights without pretending valid YAML is an error.
- Inspect the latest Home Assistant trace with chronological runtime steps, results, errors, and graph highlighting.
- Collapse the Automation YAML panel when a large graph needs more room.
- Switch between **Fit all** for overview and **Fit width** for larger, more readable nodes.
- Export the current automation map as SVG or high-resolution PNG.
- Copy Mermaid flowchart code for GitHub READMEs, wikis, and documentation.
- Use Presentation Mode for tutorials, screenshots, videos, and documentation.
- Keep unknown/new Home Assistant syntax visible instead of crashing.

## Quick start

```bash
npm install
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

The repository includes a read-only HACS-compatible custom integration under `custom_components/ha_lens`. It adds an admin-only HA Lens panel to the Home Assistant sidebar, lets you select an existing loaded automation, reads its configuration using Home Assistant's WebSocket API, enriches referenced entities with local registry metadata, and loads the latest automation trace when available.

No write action is registered. The compiled visualizer is bundled into the integration, so the Home Assistant companion does not depend on GitHub Pages at runtime.

See [`docs/hacs-companion.md`](docs/hacs-companion.md) for installation, architecture, privacy notes, and current limitations.

## Supported automation structure

The parser recognizes top-level triggers/conditions/actions plus common script control flow: `if/then/else`, `choose/default`, inline conditions, delays, waits, repeat variants, parallel branches, variables, stop, scene shortcuts, direct/targeted script calls, device actions, and normal service actions.

Unsupported constructs become `unknown` nodes and remain visible.

Path expansion is intentionally bounded and symbolic around loops and parallel execution. HA Lens does not statically execute Jinja templates or emulate Home Assistant runtime state.

See [`docs/support-matrix.md`](docs/support-matrix.md) for the current support matrix and deliberate limitations.

## Deployment

### GitHub Pages standalone build

The repository includes a GitHub Pages workflow for the standalone public demo. In the repository, **Settings → Pages → Build and deployment** must use **GitHub Actions** as the source.

The Home Assistant companion does **not** require GitHub Pages: HACS installs a locally bundled viewer under `custom_components/ha_lens/frontend/app`.

## Roadmap

The next development focus is trace fidelity:

- richer nested mapping for complex `choose`, `if`, repeat and parallel traces
- explicit branch coverage for the last Home Assistant run
- static structure vs. last-execution comparison
- later: exact MDI icons, read-only snapshots, automation diff visualization, and optional lint rules

See [`ROADMAP.md`](ROADMAP.md) for the detailed checklist.

## Privacy

The standalone app is designed to work entirely client-side. Your automation YAML is not sent to a HA Lens backend.

The companion passes the selected automation, referenced-entity metadata, and a compact latest-trace summary between Home Assistant's local panel and its locally bundled same-origin viewer. HA Lens does not expose a Home Assistant token to the viewer and does not require an external service for analysis.

## Contributing

Issues and pull requests are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md); never post Home Assistant secrets or credentials in examples.

## License

MIT
