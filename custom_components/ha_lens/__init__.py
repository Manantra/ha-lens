"""HA Lens Home Assistant companion integration."""

import json
from pathlib import Path

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.automation import DATA_COMPONENT as AUTOMATION_DATA_COMPONENT
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import (
    DOMAIN,
    PANEL_ELEMENT,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL,
    VIEWER_URL,
    STATIC_URL,
)


@websocket_api.websocket_command({"type": "ha_lens/automations"})
@websocket_api.require_admin
def websocket_automations(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """List automations that are actually loaded by Home Assistant."""
    component = hass.data.get(AUTOMATION_DATA_COMPONENT)
    if component is None:
        connection.send_result(
            msg["id"],
            {
                "automations": [],
                "total_loaded": 0,
                "usable": 0,
                "hidden_without_config": 0,
            },
        )
        return

    automations = []
    total_loaded = 0
    hidden_without_config = 0
    for automation in component.entities:
        entity_id = automation.entity_id
        if not entity_id:
            continue

        total_loaded += 1
        state = hass.states.get(entity_id)
        friendly_name = (
            state.attributes.get("friendly_name")
            if state is not None
            else None
        )
        raw_config = automation.raw_config
        if not isinstance(raw_config, dict) or not raw_config:
            hidden_without_config += 1
            continue

        config = dict(raw_config)
        automation_name = config.get("alias")

        automations.append(
            {
                "entity_id": entity_id,
                "name": automation_name or friendly_name or automation.name or entity_id,
                "id": automation.unique_id,
                "config": config,
            }
        )

    automations.sort(key=lambda item: item["name"].casefold())
    connection.send_result(
        msg["id"],
        {
            "automations": automations,
            "total_loaded": total_loaded,
            "usable": len(automations),
            "hidden_without_config": hidden_without_config,
        },
    )


def _integration_version() -> str:
    """Read the installed integration version for frontend cache busting."""
    manifest_path = Path(__file__).parent / "manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return "unknown"
    version = manifest.get("version")
    return version if isinstance(version, str) and version else "unknown"


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up HA Lens from a config entry."""
    data = hass.data.setdefault(DOMAIN, {})
    version = _integration_version()

    if not data.get("static_registered"):
        frontend_path = Path(__file__).parent / "frontend"
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(frontend_path), False)]
        )
        data["static_registered"] = True

    if not data.get("websocket_registered"):
        websocket_api.async_register_command(hass, websocket_automations)
        data["websocket_registered"] = True

    if frontend.async_panel_exists(hass, PANEL_URL):
        frontend.async_remove_panel(hass, PANEL_URL, warn_if_unknown=False)

    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL,
        webcomponent_name=PANEL_ELEMENT,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        module_url=f"{STATIC_URL}/ha-lens-panel.js?v={version}",
        require_admin=True,
        config={
            "viewer_url": VIEWER_URL,
            "version": version,
        },
        config_panel_domain=DOMAIN,
    )

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload HA Lens."""
    if frontend.async_panel_exists(hass, PANEL_URL):
        frontend.async_remove_panel(hass, PANEL_URL, warn_if_unknown=False)
    return True
