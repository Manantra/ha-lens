# HA Lens roadmap

## Current stable — v0.1.34

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
- [x] friendly names, areas and device metadata
- [x] native Home Assistant entity icon resolution and SVG rendering
- [x] entity icons in metadata cards and graph nodes
- [x] entity focus banner and nested usage context
- [x] offline domain-aware icon fallbacks when Home Assistant cannot resolve an icon
- [x] no write-back actions
- [x] latest Home Assistant trace overlay
- [x] trace inspector with chronological runtime events, results and errors
- [x] Trace “Show full run” reliably restores the complete traced run
- [x] richer nested trace mapping for `choose`, `if`, repeat and parallel structures
- [x] explicit branch coverage: executed, branch-not-taken, and not reached
- [x] compare static structure vs. last execution
- [x] repeat-iteration runtime coverage
- [x] parallel-branch runtime coverage

## Next

- [ ] improve runtime coverage labels for complex nested repeat/parallel combinations
- [ ] shareable read-only snapshots
- [x] automation diff visualization
- [ ] optional lint rules with clearly documented semantics
