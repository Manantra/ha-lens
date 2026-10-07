"""HA Lens Home Assistant companion integration."""

import json
from pathlib import Path

from aiohttp import web

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.http import HomeAssistantView

from .const import (
    DOMAIN,
    PANEL_ELEMENT,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL,
    STATIC_URL,
    VIEWER_STATIC_URL,
    VIEWER_URL,
)


class HaLensViewerView(HomeAssistantView):
    """Serve the sandboxed HA Lens viewer with wildcard CORS for its opaque origin."""

    url = f"{VIEWER_STATIC_URL}/{{path:.*}}"
    name = "ha_lens:viewer"
    requires_auth = False
    cors_allowed = True

    def __init__(self, viewer_path: Path) -> None:
        """Initialize the viewer file root."""
        self._viewer_path = viewer_path.resolve()

    async def get(self, request: web.Request, path: str) -> web.FileResponse:
        """Serve a bundled viewer file without allowing path traversal."""
        requested = (self._viewer_path / (path or "index.html")).resolve()
        if not requested.is_relative_to(self._viewer_path) or not requested.is_file():
            raise web.HTTPNotFound
        return web.FileResponse(requested)


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

    frontend_path = Path(__file__).parent / "frontend"
    if not data.get("static_registered"):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(frontend_path), False)]
        )
        data["static_registered"] = True

    if not data.get("viewer_registered"):
        hass.http.register_view(HaLensViewerView(frontend_path / "app"))
        data["viewer_registered"] = True

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
