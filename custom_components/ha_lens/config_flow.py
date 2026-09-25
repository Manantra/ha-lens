"""Config flow for HA Lens."""

from homeassistant import config_entries

from .const import DOMAIN


class HaLensConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Configure HA Lens."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Create the single HA Lens config entry."""
        return self.async_create_entry(title="HA Lens", data={})
