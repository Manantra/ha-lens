# HA Lens Home Assistant companion

The HA Lens companion is intentionally read-only.

## What it does

- Adds **HA Lens** to the Home Assistant sidebar.
- Lists actual loaded automation objects through an admin-only, read-only HA Lens WebSocket command.
- Includes each automation's existing raw configuration when Home Assistant exposes it.
- Shows a diagnostic count for readable automations and entries hidden because no usable raw configuration is available.
- Supports filtering the automation picker by alias or entity ID.
- Loads friendly names, areas, devices, and icon identifiers for referenced entities from Home Assistant's local registries.
- Loads the latest Home Assistant automation trace when available.
- Provides a dedicated Trace inspector with chronological runtime events, result/choice/condition details, errors, and graph-node mapping.
- Highlights mapped nodes from the latest run in the graph.
- Lets the YAML panel be collapsed for more graph space.
- Provides **Fit all** and **Fit width** graph viewport modes.
- Passes only the selected automation configuration, referenced-entity metadata, and compact trace data to the bundled viewer.
- Does not register any write action and does not modify automation YAML.

The panel requires an administrator. HA Lens exposes only read-only commands for loaded automation data; it does not register a command that can modify an automation.

## Architecture

```text
Home Assistant
  └─ HA Lens custom panel
       ├─ loaded automation raw_config
       ├─ area/device/entity registries
       ├─ local automation trace API
       └─ postMessage(config + metadata + compact trace)
             ↓
       Bundled HA Lens viewer
       /ha_lens_static/app/index.html
```

The companion ships the compiled visualizer inside `custom_components/ha_lens/frontend/app` and Home Assistant serves it from `/ha_lens_static/app/`. Data is transferred between same-origin browser frames with `window.postMessage`; HA Lens has no external backend that receives the YAML or trace.

The companion therefore works without GitHub Pages and does not need internet access after HACS has installed the integration. GitHub Pages remains available only for the standalone public demo.

## HACS custom-repository install

Until HA Lens is published in a default HACS catalog:

1. Add `https://github.com/Manantra/ha-lens` as a HACS custom repository of type **Integration**.
2. Download HA Lens.
3. Restart Home Assistant.
4. Go to **Settings → Devices & services → Add integration** and add **HA Lens**.
5. Open **HA Lens** from the sidebar.

## Deliberate limitations

- Read-only.
- Admin-only panel.
- Exact MDI icon rendering inside the isolated viewer is not implemented yet; HA Lens uses offline domain-aware fallback glyphs.
- Trace-to-graph mapping is currently best-effort for deeply nested control flow; richer nested mapping and branch coverage are the next trace-focused work.
