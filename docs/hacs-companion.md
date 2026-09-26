# HA Lens Home Assistant companion

The first companion release is intentionally read-only.

## What it does

- Adds **HA Lens** to the Home Assistant sidebar.
- Lists loaded `automation.*` entities.
- Lists actual automation objects loaded by Home Assistant through one admin-only, read-only HA Lens WebSocket command and includes their existing raw configuration in that response.
- Shows a small diagnostic count for readable automations and entries hidden because Home Assistant exposes no usable raw configuration.
- Supports filtering the automation picker by alias or entity ID.
- Loads the latest Home Assistant trace when available and passes a compact, read-only trace summary to the viewer so executed graph nodes can be highlighted.
- Provides a dedicated Trace inspector with chronological runtime events, result/choice/condition details, errors, and graph-node mapping.
- Passes only the selected automation configuration plus metadata for referenced entities to the HA Lens viewer in the browser.
- Does not register any write action and does not modify automation YAML.

The panel requires an administrator. HA Lens only exposes read-only commands that list loaded automations and return their existing `raw_config`; it does not register any command that can modify an automation.

## Preview architecture

```text
Home Assistant
  └─ HA Lens custom panel
       ├─ hass.states -> automation selector
       ├─ hass.connection -> automation/config
       ├─ area/device/entity registries -> referenced entity metadata
       └─ postMessage(config + metadata)
             ↓
       Bundled HA Lens viewer
       /ha_lens_static/app/index.html
```

The companion ships the compiled visualizer inside `custom_components/ha_lens/frontend/app` and Home Assistant serves it from `/ha_lens_static/app/`. The automation configuration is transferred between two same-origin browser frames with `window.postMessage`; HA Lens has no backend that receives the YAML.

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
- Admin-only panel in this preview.
- Friendly names, area names, device names, and icon identifiers are shown for referenced entities when Home Assistant provides them.
- Full MDI icon rendering inside the standalone iframe is not implemented yet.
- No trace overlay yet.
