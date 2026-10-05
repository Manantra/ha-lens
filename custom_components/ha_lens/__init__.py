"""HA Lens Home Assistant companion integration."""

import json
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import (
    DOMAIN,
    PANEL_ELEMENT,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL,
    STATIC_URL,
    VIEWER_URL,
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
            "viewer_url": f"{VIEWER_URL}?v={version}",
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
