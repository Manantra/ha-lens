# HA Lens

**Understand every path through your Home Assistant automation.**

HA Lens is a read-only visualizer and analyzer for Home Assistant automations. Paste YAML and get a semantic flow graph, execution paths, entity/action inventory, and structural insights. Nothing is executed and the YAML stays in the browser.

> Status: early MVP / v0.1.0 development. The standalone app is intentionally read-only and client-side.

## Why HA Lens?

Visual flow editors are great for *building* automations. HA Lens is deliberately different: it is an inspection, explanation, documentation, and presentation tool for automations that already exist.

- Visualize triggers, conditions, `if`, `choose`, waits, repeats, parallel blocks, and actions.
- Explore possible execution paths without touching Home Assistant.
- See referenced entities and actions in one place, then click an entity to highlight every relevant graph node.
- Surface factual structural insights without pretending legal YAML is an error.
- Use Presentation Mode for tutorials, screenshots, videos, and documentation.
- Export the current automation map directly as SVG or high-resolution PNG.
- Read a deterministic Explain view generated entirely from the parsed structure.
- Keep unknown/new Home Assistant syntax visible instead of crashing.

## Quick start

```bash
npm install
npm run dev
```

Then open the Vite URL shown in your terminal.

Run the full local quality gate with `npm run check`.

## Project structure

```text
apps/web          React + XYFlow UI
packages/model    semantic types
packages/parser   YAML -> semantic automation model
packages/analyzer stats, entities, actions, insights
packages/paths    bounded execution-path expansion
packages/graph    semantic model -> graph nodes/edges
fixtures          real-world-ish YAML examples
tests             parser/analyzer/path tests
```

## MVP scope

The parser currently recognizes top-level triggers/conditions/actions plus common script control flow: `if/then/else`, `choose/default`, inline conditions, `delay`, waits, repeat variants, `parallel`, variables, stop, and normal action/service calls. Unsupported constructs become `unknown` nodes and remain visible.

Path expansion is intentionally bounded and symbolic around loops/parallel execution; HA Lens does not claim to statically execute Jinja templates or emulate Home Assistant.

## Deployment

### One-time GitHub Pages setup

In the repository, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**. This is a one-time repository setting; after that, every push to `main` deploys automatically.

The repository includes a GitHub Pages workflow. For the planned `Manantra/ha-lens` repository it builds the app with `/ha-lens/` as the base path and publishes `apps/web/dist`.

## Roadmap

- richer Home Assistant condition/trigger labels
- path highlighting and branch explanations
- SVG/PNG export
- better template reference extraction
- trace overlay
- optional HACS companion panel for loading automations directly from Home Assistant

## Privacy

The standalone app is designed to work entirely client-side. Your automation YAML is not sent to a HA Lens backend.

See [`docs/support-matrix.md`](docs/support-matrix.md) for the v0.1 syntax matrix and deliberate limitations.

## Contributing

Issues and pull requests are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md); never post Home Assistant secrets or credentials in examples.

## License

MIT
