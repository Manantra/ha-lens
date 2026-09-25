# v0.1 support matrix

HA Lens v0.1 is a static, read-only analyzer. "Supported" means the construct is preserved in the semantic model and represented in the graph; it does not mean HA Lens executes Home Assistant semantics.

| Home Assistant construct | v0.1 behavior |
| --- | --- |
| `trigger` / `triggers` | Parsed and visualized |
| `condition` / `conditions` | Parsed as stop/continue decision |
| `action` / `actions` | Parsed and inventoried |
| `if` / `then` / `else` | Branches + merge |
| `choose` / `default` | Ordered branch visualization + fallback |
| inline condition action | True/false branch; false stops sequence |
| `delay` | Action node |
| `wait_template` | Wait node; timeout behavior represented |
| `wait_for_trigger` | Wait node; timeout behavior represented |
| `repeat` | Symbolic loop; body parsed |
| `parallel` | Branches + join; path engine keeps it symbolic |
| `variables` | Action node |
| `stop` | Terminal node |
| Jinja templates | Preserved; common static entity references extracted |
| unknown/new syntax | Preserved as an unknown node instead of crashing |

## Deliberate limitations

- No action is ever executed.
- Templates are not evaluated against Home Assistant state.
- Loop iteration counts are not guessed when they depend on runtime state.
- Parallel interleavings are not expanded combinatorially.
- Path enumeration has a hard cap to keep complex automations usable.
- Device/area friendly names require a future Home Assistant companion integration.
