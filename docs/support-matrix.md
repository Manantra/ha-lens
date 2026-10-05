# HA Lens support matrix

HA Lens is a static, read-only analyzer. “Supported” means a construct is preserved in the semantic model and represented meaningfully; Home Assistant remains the authority for actual execution semantics.

| Home Assistant construct | Current behavior |
| --- | --- |
| `trigger` / `triggers` | Parsed and visualized; nested Trigger Lists are flattened into Home Assistant leaf/runtime order |
| purpose-specific triggers | Generic readable type + entity/device/area/floor/label target context, without hard-coding every integration |
| `enabled: false` | Remains visible as disabled but is excluded from execution-path semantics |
| `condition` / `conditions` | Parsed as stop/continue decisions with common summaries |
| logical condition shorthands | `condition: [...]`, `and`, `or`, and `not` are normalized, including inline action conditions |
| purpose-specific conditions | Generic readable type + target context |
| `action` / `actions` / `service` | Parsed and inventoried |
| `service_template` | Preserved as a service action |
| `sequence` | Nested ordered sequence |
| `event` | Event action node |
| `set_conversation_response` | Conversation-response action node |
| `if` / `then` / `else` | Branches + merge |
| `choose` / `default` | Ordered branch visualization + fallback |
| `delay` | Action node |
| `wait_template` | Wait node; timeout behavior represented |
| `wait_for_trigger` | Wait node; timeout behavior represented; nested trigger targets included in static target analysis |
| `repeat` | Symbolic loop; body parsed; while/until targets included in static target analysis |
| `parallel` | Branches + join; path engine keeps interleavings symbolic |
| `variables` | Action node |
| `stop` / `error` | Terminal node; error stops are called out |
| `note` / `continue_on_error` / `response_variable` | Surfaced in graph/insights where applicable |
| target entity/device/area/floor/label | Collected semantically; template target strings are not misreported as concrete IDs |
| scene and script shortcuts | Normalized/inventoried where statically resolvable |
| Home Assistant device actions | Parsed as supported action nodes, including entity-registry IDs |
| Jinja templates | Preserved; common static entity references extracted but not evaluated |
| unknown/new syntax | Preserved as an unknown node instead of crashing |
| pathological nesting | Rejected with a clear safety-limit error before browser stack exhaustion |

## Home Assistant companion data

| Companion feature | Current behavior |
| --- | --- |
| Loaded automations | Listed from Home Assistant state; selected config fetched through official `automation/config` |
| Unavailable automation | Clearly marked while remaining inspectable when Home Assistant can return its config |
| HA-resolved references | `search/related` resolves entities/devices/areas/floors/labels and is compared with HA Lens static extraction |
| Friendly metadata | Local entity/device/area/floor/label registries, including child-device area inheritance |
| Entity icons | Home Assistant resolves the current icon; HA Lens renders resulting SVG path data locally |
| Latest execution | Latest trace whose summary is not `not_triggered` |
| Trigger diagnostic | Latest `not_triggered` trace shown separately and never used as Last run execution coverage |
| Runtime targets | Resolved service-call targets from trace `result.params.target` when available |
| Structure vs. Last run | Complete static graph vs conservative execution coverage |
| Branch coverage | Taken branches green; known sibling non-taken branches orange/dashed; unreached graph dimmed |
| Repeat runtime coverage | Observed iteration count and concrete iteration index where available |
| Parallel runtime coverage | Observed/configured branch counts; only observed branches marked executed |
| Automation diff | Local baseline comparison for added / changed / removed graph nodes; generated HA trigger IDs do not create false changes |
| Write-back | Not implemented; integration remains read-only |

## Security and compatibility guardrails

- Companion viewer is sandboxed and uses nonce-authenticated parent/child messaging.
- Incoming trace/reference payloads are schema-filtered and bounded.
- Parser nesting and execution-path expansion are bounded.
- Dependency installation is lockfile-based; CI audits dependencies and produces a CycloneDX SBOM.
- GitHub Actions are pinned by immutable SHAs and write permission is restricted to publish/release jobs.
- Automated contract checks cover current Home Assistant Stable and Beta lines.

## Deliberate limitations

- HA Lens never executes actions or modifies automation YAML in Home Assistant.
- Templates are not evaluated against Home Assistant state.
- Loop iteration counts are not guessed statically when they depend on runtime state.
- Parallel interleavings are not expanded combinatorially.
- Runtime trace mapping remains best-effort for unusually deep or mixed control flow.
