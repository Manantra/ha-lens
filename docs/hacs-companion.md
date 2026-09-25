# HA Lens Home Assistant companion

The first companion release is intentionally read-only.

## What it does

- Adds **HA Lens** to the Home Assistant sidebar.
- Lists loaded `automation.*` entities.
- Reads the selected automation with Home Assistant's existing `automation/config` WebSocket command.
- Passes only the selected automation configuration plus metadata for referenced entities to the HA Lens viewer in the browser.
- Does not register any write action and does not modify automation YAML.

The panel requires an administrator because Home Assistant's `automation/config` WebSocket command is admin-only.

## Preview architecture

```text
Home Assistant
  └─ HA Lens custom panel
       ├─ hass.states -> automation selector
       ├─ hass.connection -> automation/config
       ├─ area/device/entity registries -> referenced entity metadata
       └─ postMessage(config + metadata)
             ↓
       HA Lens standalone viewer
       https://manantra.github.io/ha-lens/
```

The preview loads the visualizer frontend from GitHub Pages. The automation configuration is transferred between the two browser frames with `window.postMessage`; HA Lens has no backend that receives the YAML. Loading the viewer itself still requires internet access.

A later companion version should ship the full visualizer frontend locally with the integration so it works without GitHub Pages.

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
