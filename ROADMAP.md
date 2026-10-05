# HA Lens roadmap

## Current stable — v0.1.34

The next release line is **v0.1.35**, focused on Home Assistant 2026 compatibility and security hardening rather than a new headline feature.

### Visual inspection

- [x] YAML input and semantic parser
- [x] top-level trigger / condition / action flow
- [x] `if / then / else`
- [x] `choose / default`
- [x] waits, delays, repeat, parallel, variables and stop
- [x] scene shortcut actions, direct script calls and device actions
- [x] nested `sequence`, event actions and conversation responses
- [x] Home Assistant logical-condition shorthands
- [x] nested Home Assistant trigger-list flattening
- [x] disabled trigger / condition / action semantics
- [x] purpose-specific entity / device / area / floor / label targets
- [x] bounded execution-path explorer with terminal-effect path names
- [x] entity / target / action inventory
- [x] richer trigger and condition labels
- [x] richer template entity extraction
- [x] unknown-node fallback for unsupported/new syntax
- [x] parser nesting safety limit
- [x] structural insights and deterministic Explain view
- [x] clickable entity focus with usage context
- [x] SVG / PNG / Mermaid export
- [x] presentation mode
- [x] responsive desktop / tablet / mobile layout
- [x] collapsible Automation YAML panel
- [x] graph `Fit all` / `Fit width` modes
- [x] local baseline-based automation diff visualization

### Home Assistant companion

- [x] HACS-compatible read-only custom integration
- [x] admin-only panel and no write-back actions
- [x] list loaded automation entities from Home Assistant state
- [x] fetch only the selected config through official `automation/config`
- [x] resolve references through official `search/related`
- [x] entity, device, area, floor and label metadata
- [x] child-device area inheritance
- [x] unavailable Home Assistant automations remain inspectable but clearly marked
- [x] native Home Assistant entity icon resolution and SVG rendering
- [x] sandboxed local viewer with nonce-authenticated messaging
- [x] bounded/sanitized companion payload and trace results
- [x] latest Home Assistant execution trace overlay
- [x] separate `not_triggered` trigger diagnostics from real executions
- [x] runtime target details from Home Assistant trace service-call results
- [x] trace inspector with chronological runtime events, results and errors
- [x] richer nested trace mapping for `choose`, `if`, repeat and parallel structures
- [x] explicit branch coverage: executed, branch-not-taken, and not reached
- [x] compare static structure vs. last execution
- [x] repeat-iteration and parallel-branch runtime coverage
- [x] 2026.10 generated trigger-ID compatible Diff matching

### Build and compatibility hardening

- [x] committed npm lockfile and reproducible `npm ci` installs
- [x] dependency audit and CycloneDX SBOM in CI
- [x] build job separated from repository-write bundle publish job
- [x] GitHub Actions pinned by immutable commit SHA
- [x] minimized workflow permissions
- [x] Home Assistant compatibility contract workflow
- [x] pinned Home Assistant 2026.9.4 Stable contract check
- [x] pinned Home Assistant 2026.10 beta contract check

## Next

- [ ] live-test v0.1.35 beta on a real Home Assistant instance
- [ ] additional runtime-label polish for unusually deep mixed control flow
- [ ] shareable read-only snapshots
- [ ] optional lint rules with clearly documented semantics
