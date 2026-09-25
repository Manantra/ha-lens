# HA Lens roadmap

## v0.1 — Visual inspection MVP

- [x] YAML input
- [x] semantic parser
- [x] top-level trigger/condition/action flow
- [x] `if/then/else`
- [x] `choose/default`
- [x] waits, delays, repeat, parallel, variables, stop
- [x] bounded path explorer
- [x] entity/action inventory
- [x] structural insights
- [x] presentation mode
- [x] deterministic explain view
- [x] richer trigger and condition labels
- [x] unknown-node fallback
- [x] SVG/PNG export
- [x] Mermaid export
- [ ] richer condition labels
- [x] clickable entity highlighting
- [x] richer template entity extraction
- [x] expanded real-world fixture suite
- [x] responsive mobile/tablet layout

## v0.2 — Documentation

- shareable read-only snapshots
- downloadable SVG/PNG
- human-readable deterministic explanation
- path naming based on terminal effects

## v0.3 — Home Assistant companion

- [x] optional HACS-compatible panel preview
- [x] select an existing automation directly
- [x] read automation config through Home Assistant's existing WebSocket API
- [ ] bundle the full visualizer locally for offline use
- [x] friendly names, areas, device metadata and icon identifiers
- [ ] render Home Assistant / MDI icons visually
- [x] no write-back in the first companion release

## Later

- trace overlay
- compare structure vs. last execution
- automation diff visualization
- optional lint rules with clearly documented semantics
