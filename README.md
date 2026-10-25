# HA Lens

![HA Lens logo](https://raw.githubusercontent.com/Manantra/ha-lens/main/assets/ha-lens-logo.png)

[![CI](https://github.com/Manantra/ha-lens/actions/workflows/ci.yml/badge.svg)](https://github.com/Manantra/ha-lens/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Understand every path through your Home Assistant automation.**

HA Lens is a **read-only automation explorer** for Home Assistant. It turns YAML into visual flow graphs and bounded execution paths, helps you find referenced entities and actions, and—in its Home Assistant companion—shows the latest execution trace. It **does not change, run, or deploy automations**.

## Get started

| I want to… | Start here |
| :-- | :-- |
| **Use HA Lens inside Home Assistant** | [Install the HACS custom integration](docs/hacs-companion.md#hacs-custom-repository-install). The companion runs a bundled local viewer; GitHub Pages is not required. |
| **Explore YAML in a standalone viewer** | Follow the [local quick start](#quick-start) with Node.js and npm. Your YAML is analyzed in the browser, not sent to a HA Lens backend. |
| **Check supported features** | See the [automation support matrix](docs/support-matrix.md), including deliberate limitations. |
| **Understand the implementation or contribute** | Browse the [architecture](docs/architecture.md), [roadmap](ROADMAP.md), or [contribution guide](CONTRIBUTING.md). |

> **Visual examples:** HA Lens can export an automation graph as SVG or PNG, and its Presentation Mode is intended for readable demonstrations. Avoid publishing real automation traces, tokens, or private entity names in screenshots.

> Current stable companion release: **v0.1.36**. Latest published preview at the time of this README update: **v0.1.38-beta.2**, with seven-language localization, generated-graph-label translation and locale-aware quantity grammar. This beta has passed automated CI and Home Assistant compatibility checks but still needs user-assisted real-browser validation before becoming Stable. HA Lens remains read-only: it analyzes automations but does not execute or modify them.

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
- Save/open local read-only snapshots containing only automation YAML plus minimal snapshot metadata; no trace or registry data is included.
- Run optional conservative lint checks on demand; lint findings are advisory and never replace Home Assistant validation.
- Understand Home Assistant 2026.10 Triggered by references, including generated-ID churn, shared manual IDs, dangling references, and the new state-condition duration validation rules.
- Keep templated targets explicit as runtime-resolved instead of pretending they are static entity/device/area/floor/label IDs.
- Follow the Home Assistant user's interface language automatically: English, German, Spanish, Portuguese, Turkish, Polish, or Russian. The standalone viewer offers a manual language selector; unsupported locales fall back to English. YAML syntax, entity IDs, automation names, and Home Assistant brand names are not translated.

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

For a complete project handoff (including release status, locale rules, test plan, and next-chat prompt), see [`docs/NEXT_CHAT_HANDOFF.md`](docs/NEXT_CHAT_HANDOFF.md).

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

The Home Assistant 2026 compatibility and security-hardening work is available in Stable **v0.1.36**. The next focus is:

- live-test **v0.1.38-beta.2** in Home Assistant across the seven supported languages, including language switching and unchanged YAML
- confirm responsive graph/Trace/Diff/Lint presentation, generated labels and language-specific plural forms
- release v0.1.38 Stable only after the real-browser test passes; continue improving snapshot/lint UX only from user feedback

See [`ROADMAP.md`](ROADMAP.md) for the detailed checklist.

## Privacy

The standalone app is designed to work entirely client-side. Your automation YAML is not sent to a HA Lens backend.

The companion passes only the selected automation plus bounded metadata/trace data to a locally bundled **sandboxed** viewer. Parent/child messages use a per-panel random nonce and the viewer validates and caps incoming payloads. HA Lens does not expose a Home Assistant token to the viewer and does not require an external service for analysis.

## Contributing

Issues and pull requests are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md); never post Home Assistant secrets or credentials in examples.

## License

MIT
