# HA Lens support matrix

HA Lens is a static, read-only analyzer. “Supported” means a construct is preserved in the semantic model and represented meaningfully in the graph; it does not mean HA Lens executes Home Assistant semantics.

| Home Assistant construct | Current behavior |
| --- | --- |
| `trigger` / `triggers` | Parsed and visualized with common human-readable summaries |
| `condition` / `conditions` | Parsed as stop/continue decisions with common summaries |
| `action` / `actions` / `service` | Parsed and inventoried |
| `if` / `then` / `else` | Branches + merge |
| `choose` / `default` | Ordered branch visualization + fallback |
| inline condition action | True/false branch; false stops the sequence |
| `delay` | Action node |
| `wait_template` | Wait node; timeout behavior represented |
| `wait_for_trigger` | Wait node; timeout behavior represented |
| `repeat` | Symbolic loop; body parsed |
| `parallel` | Branches + join; path engine keeps interleavings symbolic |
| `variables` | Action node |
| `stop` | Terminal node |
| `scene: scene.example` shortcut | Normalized to a scene activation action |
| direct `script.example` action | Rendered as a script run and inventoried as an entity |
| `script.turn_on` target | Rendered as a script run and targeted script inventoried |
| Home Assistant device actions | Parsed as supported action nodes |
| Jinja templates | Preserved; common static entity references extracted |
| unknown/new syntax | Preserved as an unknown node instead of crashing |

## Home Assistant companion data

| Companion feature | Current behavior |
| --- | --- |
| Loaded automations | Read from Home Assistant through an admin-only WebSocket command |
| Friendly entity names | Loaded from local state / entity registry when available |
| Area and device names | Loaded from local registries when available |
| Entity icons | Icon identifiers are loaded; HA Lens currently renders offline domain-aware fallback glyphs |
| Latest automation trace | Loaded through Home Assistant's local trace WebSocket API |
| Runtime trace steps | Chronological inspector with results/errors and graph-node mapping |
| Trace highlighting | Mapped runtime nodes are highlighted in the graph |
| YAML panel | Can be hidden to give the graph more space |
| Graph fitting | `Fit all` overview and optional `Fit width` detail mode |
| Write-back | Not implemented; the integration remains read-only |

## Deliberate limitations

- No action is ever executed by HA Lens.
- HA Lens does not modify automation YAML.
- Templates are not evaluated against Home Assistant state.
- Loop iteration counts are not guessed when they depend on runtime state.
- Parallel interleavings are not expanded combinatorially.
- Path enumeration has a hard cap to keep complex automations usable.
- Runtime trace mapping is best-effort; richer mapping of deeply nested branches, repeats and parallel structures is the next trace-focused work.
- Exact Home Assistant / MDI icon rendering inside the isolated viewer is not implemented yet.
