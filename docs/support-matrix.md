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
| Entity icons | Home Assistant resolves the current entity icon; HA Lens renders the resulting SVG path locally in entity cards and graph nodes, with offline fallbacks when resolution is unavailable |
| Latest automation trace | Loaded through Home Assistant's local trace WebSocket API |
| Runtime trace steps | Chronological inspector with results/errors and graph-node mapping |
| Trace highlighting | Mapped runtime nodes and executed flow are highlighted in the graph |
| Structure vs. Last run | Toggle between the complete static graph and conservative runtime coverage |
| Branch coverage | Explicitly taken branches are green; sibling branch edges known not to be taken are orange/dashed; unreached graph elements are dimmed |
| Repeat runtime coverage | Observed repeat iteration count is shown on the loop node; repeat steps can show their concrete iteration index |
| Parallel runtime coverage | Parallel nodes show observed/configured branch counts; only branches actually present in the Home Assistant trace are marked executed |
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
- Runtime trace mapping is still best-effort for unusually deep or mixed control-flow structures, but repeat iterations and parallel branch observation are now covered.
