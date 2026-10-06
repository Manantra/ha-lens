# HA Lens Home Assistant companion

The HA Lens companion is intentionally read-only and admin-only.

## What it does

- Adds **HA Lens** to the Home Assistant sidebar.
- Lists loaded `automation.*` entities from Home Assistant state.
- Fetches only the selected automation using Home Assistant's official `automation/config` WebSocket command.
- Resolves referenced entities, devices, areas, floors and labels with official `search/related` plus local registries.
- Marks Home Assistant automations that are `unavailable` while still allowing their raw configuration to be inspected when `automation/config` is available.
- Handles child-device area inheritance when registry metadata is available.
- Resolves native Home Assistant entity icons and passes only SVG path data to the viewer.
- Loads the latest real automation execution and the latest `not_triggered` trigger diagnostic separately.
- Shows resolved runtime service targets from the Home Assistant trace where available.
- Provides the Trace inspector, Structure/Last run coverage, readable runtime breadcrumbs, repeat iteration counts and parallel branch coverage.
- Captures a local Diff baseline and compares local YAML edits without registering any write command.
- Saves and opens local HA Lens snapshots containing only automation YAML plus minimal snapshot metadata; traces and registry metadata are not exported.
- Offers opt-in local lint checks whose findings are advisory and separate from Home Assistant validation.
- Does not register a Home Assistant action/service that can modify or execute an automation.

## Architecture

```text
Home Assistant admin panel
  ├─ hass.states → automation picker
  ├─ automation/config → selected config only
  ├─ search/related → HA-resolved references
  ├─ entity/device/area/floor/label registries → friendly metadata
  ├─ trace/list + trace/get → execution + trigger diagnostic
  └─ compact + bounded postMessage payload + random nonce
            ↓
  sandboxed bundled HA Lens viewer
  /ha_lens_static/app/index.html
```

The compiled visualizer is shipped inside `custom_components/ha_lens/frontend/app`. It therefore works without GitHub Pages and does not need an external HA Lens backend.

The viewer iframe is sandboxed without `allow-same-origin`. Because a sandboxed iframe has an opaque origin, parent/child messages use the concrete window source plus a per-instance random nonce instead of trusting a wildcard message by itself. Incoming trace/reference metadata is schema-filtered and bounded before use.

## Home Assistant compatibility

The repository contains an automated contract workflow for the official Home Assistant interfaces HA Lens depends on. The current hardening line checks:

- Home Assistant **2026.9.4 Stable**
- Home Assistant **2026.10 beta**, pinned to the exact upstream beta commit when the corresponding PyPI prerelease is not yet mirrored

The checked contracts include `automation/config`, `search/related`, `trace/list`, `trace/get`, and floor/label registry list commands. HA Lens no longer imports Home Assistant's private automation component storage or exposes its own automation-config dump WebSocket command.

## HACS custom-repository install

Until HA Lens is published in a default HACS catalog:

1. Add `https://github.com/Manantra/ha-lens` as a HACS custom repository of type **Integration**.
2. Download HA Lens.
3. Restart Home Assistant.
4. Go to **Settings → Devices & services → Add integration** and add **HA Lens**.
5. Open **HA Lens** from the sidebar.

## Deliberate limitations

- Read-only and admin-only.
- Templates are not executed by HA Lens.
- Exact runtime behavior remains Home Assistant's authority; static path expansion is bounded and loops/parallel interleavings stay symbolic.
- If Home Assistant cannot resolve an entity icon, HA Lens falls back to an offline domain-aware glyph.
- Trace-to-graph mapping is best-effort for unusually deep or mixed control-flow structures.
