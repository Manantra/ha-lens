# HA Lens roadmap

## Current stable — v0.1.28

### Visual inspection

- [x] YAML input and semantic parser
- [x] top-level trigger / condition / action flow
- [x] `if / then / else`
- [x] `choose / default`
- [x] waits, delays, repeat, parallel, variables and stop
- [x] scene shortcut actions, direct script calls and device actions
- [x] bounded execution-path explorer with terminal-effect path names
- [x] entity / action inventory
- [x] richer trigger and condition labels
- [x] richer template entity extraction
- [x] unknown-node fallback for unsupported/new syntax
- [x] structural insights
- [x] deterministic Explain view
- [x] clickable entity focus with usage context
- [x] SVG / PNG export
- [x] Mermaid export
- [x] presentation mode
- [x] responsive desktop / tablet / mobile layout
- [x] collapsible Automation YAML panel
- [x] graph `Fit all` / `Fit width` modes
- [x] expanded real-world fixture suite

### Home Assistant companion

- [x] HACS-compatible read-only custom integration
- [x] select existing loaded automations directly
- [x] search / filter automation picker
- [x] read automation config through Home Assistant's WebSocket API
- [x] bundle the full visualizer locally for offline use
- [x] friendly names, areas, device metadata and icon identifiers
- [x] clearer entity metadata cards and friendly-name sorting
- [x] entity focus banner and nested usage context
- [x] offline domain-aware entity icon fallbacks
- [x] no write-back actions
- [x] latest Home Assistant trace overlay
- [x] trace inspector with chronological runtime events, results and errors
- [x] Trace “Show full run” reliably restores the complete traced run

## Next — Trace fidelity

- [ ] richer nested trace mapping for `choose`, `if`, repeat and parallel structures
- [ ] explicit branch coverage: executed, evaluated-but-not-taken, and not reached
- [ ] compare static structure vs. last execution
- [ ] add trace-mapping regression fixtures/tests based on real Home Assistant paths

## Later

- [ ] render exact Home Assistant / MDI entity icons inside the isolated viewer
- [ ] shareable read-only snapshots
- [ ] automation diff visualization
- [ ] optional lint rules with clearly documented semantics
