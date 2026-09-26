const DEFAULT_VIEWER_URL = "/ha_lens_static/app/index.html";

class HaLensPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._panel = null;
    this._selected = "";
    this._pendingMessage = null;
    this._registryPromise = null;
    this._automationItems = [];
    this._automationListPromise = null;
    this._diagnosticsText = "";
    this._filterQuery = "";
    this._targetOrigin = window.location.origin;
    this._onWindowMessage = this._onWindowMessage.bind(this);
  }

  set hass(value) {
    this._hass = value;
    if (this.isConnected && !this._automationListPromise) {
      void this._refreshAutomations();
    }
  }

  set panel(value) {
    this._panel = value;
    if (this.isConnected) this._applyPanelConfig();
  }

  set narrow(value) {
    this.toggleAttribute("narrow", Boolean(value));
  }

  connectedCallback() {
    this._render();
    window.addEventListener("message", this._onWindowMessage);
  }

  disconnectedCallback() {
    window.removeEventListener("message", this._onWindowMessage);
  }

  _viewerUrl() {
    return this._panel?.config?.viewer_url || DEFAULT_VIEWER_URL;
  }

  _embeddedUrl() {
    const url = new URL(this._viewerUrl(), window.location.origin);
    url.searchParams.set("embedded", "1");
    return url.toString();
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100vh;
          height: 100dvh;
          min-height: 100vh;
          min-height: 100dvh;
          overflow: hidden;
          color: var(--primary-text-color, #eef2ff);
          background: var(--primary-background-color, #0b0d12);
          font-family: var(--paper-font-body1_-_font-family, system-ui, sans-serif);
        }

        .shell {
          height: 100vh;
          height: 100dvh;
          min-height: 0;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          background: #0b0d12;
        }

        .toolbar {
          display: flex;
          align-items: center;
          gap: 12px;
          min-height: 58px;
          padding: 10px 14px;
          border-bottom: 1px solid rgba(127, 138, 160, .25);
          background: #10131a;
          box-sizing: border-box;
        }

        .brand {
          min-width: max-content;
          font-weight: 800;
          color: #eef2ff;
        }

        .brand span {
          color: #7c9cff;
        }

        .automation-search,
        select {
          flex: 1;
          min-width: 180px;
          max-width: 620px;
          height: 38px;
          border: 1px solid #343b4a;
          border-radius: 9px;
          padding: 0 10px;
          color: #e9eefc;
          background: #181d27;
          font: inherit;
        }

        .automation-search {
          max-width: 240px;
        }

        .status {
          margin-left: auto;
          color: #8d98af;
          font-size: 12px;
          text-align: right;
        }

        .status[data-error="true"] {
          color: #ff9ca7;
        }

        iframe {
          display: block;
          width: 100%;
          height: 100%;
          min-height: 0;
          border: 0;
          background: #0b0d12;
        }

        @media (max-width: 720px) {
          .toolbar {
            align-items: stretch;
            flex-wrap: wrap;
          }

          .brand {
            width: 100%;
          }

          select {
            max-width: none;
          }

          .status {
            width: 100%;
            margin-left: 0;
            text-align: left;
          }
        }
      </style>
      <div class="shell">
        <div class="toolbar">
          <div class="brand"><span>◉</span> HA Lens</div>
          <input class="automation-search" type="search" placeholder="Filter automations…" aria-label="Filter automations" />
          <select aria-label="Home Assistant automation">
            <option value="">Select an automation…</option>
          </select>
          <div class="status">Read-only · select an automation</div>
        </div>
        <iframe title="HA Lens automation analyzer"></iframe>
      </div>
    `;

    this._search = this.shadowRoot.querySelector(".automation-search");
    this._select = this.shadowRoot.querySelector("select");
    this._status = this.shadowRoot.querySelector(".status");
    this._frame = this.shadowRoot.querySelector("iframe");

    this._search.addEventListener("input", () => {
      this._filterQuery = this._search.value.trim().toLocaleLowerCase();
      this._syncAutomations();
    });

    this._select.addEventListener("change", () => {
      this._selected = this._select.value;
      if (this._selected) void this._loadAutomation(this._selected);
    });

    this._frame.addEventListener("load", () => this._sendPending());
    this._applyPanelConfig();
    void this._refreshAutomations();
  }

  _applyPanelConfig() {
    if (!this._frame) return;
    const viewerUrl = new URL(this._viewerUrl(), window.location.origin);
    this._targetOrigin = viewerUrl.origin;
    const nextUrl = this._embeddedUrl();
    if (this._frame.src !== nextUrl) this._frame.src = nextUrl;
  }

  _automations() {
    return this._automationItems;
  }

  async _refreshAutomations() {
    if (!this._hass?.callWS) return;
    if (this._automationListPromise) return this._automationListPromise;

    this._automationListPromise = this._hass.callWS({ type: "ha_lens/automations" })
      .then((payload) => {
        const items = Array.isArray(payload) ? payload : (payload?.automations ?? []);
        const usable = Array.isArray(payload) ? items.length : (payload?.usable ?? items.length);
        const hidden = Array.isArray(payload) ? 0 : (payload?.hidden_without_config ?? 0);
        const totalLoaded = Array.isArray(payload) ? items.length : (payload?.total_loaded ?? usable + hidden);

        this._automationItems = items
          .filter((item) =>
            item?.entity_id
            && item?.config
            && typeof item.config === "object"
            && !Array.isArray(item.config)
          )
          .map((item) => ({
            entityId: item.entity_id,
            name: item.name || item.entity_id,
            automationId: item.id ?? null,
            config: item.config ?? null,
          }))
          .sort((left, right) => left.name.localeCompare(right.name));

        const diagnostics = [`${usable} available`];
        if (hidden > 0) diagnostics.push(`${hidden} hidden (no readable config)`);
        if (totalLoaded !== usable + hidden) diagnostics.push(`${totalLoaded} loaded by Home Assistant`);
        this._diagnosticsText = diagnostics.join(" · ");

        this._syncAutomations();
        this._setStatus(
          this._automationItems.length
            ? `Read-only · ${this._diagnosticsText}`
            : `No readable automations · ${this._diagnosticsText}`,
          false,
        );
      })
      .catch((error) => {
        console.error("HA Lens could not list automations", error);
        const message = error?.message || error?.code || String(error);
        this._setStatus(`Could not list automations: ${message}`, true);
        this._automationItems = [];
        this._syncAutomations();
      })
      .finally(() => {
        this._automationListPromise = null;
      });

    return this._automationListPromise;
  }

  _syncAutomations() {
    if (!this._select) return;
    const automations = this._automations();
    const previous = this._selected || this._select.value;
    const query = this._filterQuery;
    const visible = query
      ? automations.filter((automation) =>
          automation.name.toLocaleLowerCase().includes(query)
          || automation.entityId.toLocaleLowerCase().includes(query)
        )
      : automations;

    this._select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = !automations.length
      ? "No automations found"
      : visible.length
        ? "Select an automation…"
        : "No matching automations";
    this._select.append(placeholder);

    for (const automation of visible) {
      const option = document.createElement("option");
      option.value = automation.entityId;
      option.textContent = automation.name;
      this._select.append(option);
    }

    if (visible.some((automation) => automation.entityId === previous)) {
      this._select.value = previous;
      this._selected = previous;
    }
  }

  _collectEntityIds(value, output = new Set()) {
    if (typeof value === "string") {
      for (const match of value.matchAll(/\b(?:states|is_state|is_state_attr|state_attr|has_value|expand)\(\s*["']([a-z0-9_]+\.[a-z0-9_]+)["']/gi)) {
        output.add(match[1]);
      }
      for (const match of value.matchAll(/\bstates\.([a-z0-9_]+)\.([a-z0-9_]+)\b/gi)) {
        output.add(`${match[1]}.${match[2]}`);
      }
      return output;
    }

    if (Array.isArray(value)) {
      for (const item of value) this._collectEntityIds(item, output);
      return output;
    }

    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (key === "entity_id") {
          const values = Array.isArray(child) ? child : [child];
          for (const entityId of values) {
            if (typeof entityId === "string" && /^[a-z0-9_]+\.[a-z0-9_]+$/i.test(entityId)) {
              output.add(entityId);
            }
          }
        }
        this._collectEntityIds(child, output);
      }
    }

    return output;
  }

  async _registryData() {
    if (!this._hass?.callWS) return { areas: [], devices: [], entities: [] };

    if (!this._registryPromise) {
      this._registryPromise = Promise.all([
        this._hass.callWS({ type: "config/area_registry/list" }),
        this._hass.callWS({ type: "config/device_registry/list" }),
        this._hass.callWS({ type: "config/entity_registry/list" }),
      ])
        .then(([areas, devices, entities]) => ({ areas, devices, entities }))
        .catch((error) => {
          console.warn("HA Lens could not load registry metadata", error);
          return { areas: [], devices: [], entities: [] };
        });
    }

    return this._registryPromise;
  }

  async _latestTrace(automation) {
    if (!automation?.automationId || !this._hass?.callWS) return null;

    try {
      const itemId = String(automation.automationId);
      const traces = await this._hass.callWS({
        type: "trace/list",
        domain: "automation",
        item_id: itemId,
      });
      if (!Array.isArray(traces) || !traces.length) return null;

      const latest = [...traces].sort((left, right) =>
        String(right?.timestamp?.start || "").localeCompare(String(left?.timestamp?.start || ""))
      )[0];
      if (!latest?.run_id) return null;

      const extended = await this._hass.callWS({
        type: "trace/get",
        domain: "automation",
        item_id: itemId,
        run_id: latest.run_id,
      });

      return {
        runId: extended?.run_id || latest.run_id,
        state: extended?.state || latest?.state || null,
        scriptExecution: extended?.script_execution ?? latest?.script_execution ?? null,
        startedAt: extended?.timestamp?.start || latest?.timestamp?.start || null,
        finishedAt: extended?.timestamp?.finish || latest?.timestamp?.finish || null,
        lastStep: extended?.last_step ?? latest?.last_step ?? null,
        error: extended?.error || latest?.error || null,
        notTriggered: Boolean(extended?.not_triggered ?? latest?.not_triggered),
        paths: Object.keys(extended?.trace || {}),
      };
    } catch (error) {
      console.warn("HA Lens could not load the latest automation trace", error);
      return null;
    }
  }

  async _entityMetadata(config) {
    const entityIds = this._collectEntityIds(config);
    const { areas, devices, entities } = await this._registryData();

    const areasById = new Map(areas.map((area) => [area.area_id, area]));
    const devicesById = new Map(devices.map((device) => [device.id, device]));
    const entitiesById = new Map(entities.map((entity) => [entity.entity_id, entity]));
    const metadata = {};

    for (const entityId of entityIds) {
      const state = this._hass?.states?.[entityId];
      const registry = entitiesById.get(entityId);
      const device = registry?.device_id ? devicesById.get(registry.device_id) : null;
      const areaId = registry?.area_id || device?.area_id;
      const area = areaId ? areasById.get(areaId) : null;

      metadata[entityId] = {
        name: registry?.name || state?.attributes?.friendly_name || registry?.original_name || entityId,
        icon: registry?.icon || state?.attributes?.icon || null,
        area: area?.name || null,
        device: device?.name_by_user || device?.name || null,
      };
    }

    return metadata;
  }

  async _loadAutomation(entityId) {
    if (!this._hass?.callWS) {
      this._setStatus("Home Assistant WebSocket API is unavailable.", true);
      return;
    }

    this._setStatus("Loading automation…", false);

    try {
      const selected = this._automations().find((automation) => automation.entityId === entityId);
      const config = selected?.config ?? null;

      if (!config) {
        throw new Error(`No loaded config for ${entityId}. Refresh HA Lens after Home Assistant reloads automations.`);
      }

      const [entityMetadata, trace] = await Promise.all([
        this._entityMetadata(config),
        this._latestTrace(selected),
      ]);

      this._pendingMessage = {
        type: "ha-lens:automation",
        version: 1,
        entityId,
        config,
        entityMetadata,
        trace,
      };

      this._sendPending();
      const selectedLabel = selected ? selected.name : entityId;
      this._setStatus(
        this._diagnosticsText ? `${selectedLabel} · ${this._diagnosticsText}` : selectedLabel,
        false,
      );
    } catch (error) {
      console.error("HA Lens could not load the automation", error);
      const message =
        error?.message
        || error?.code
        || (typeof error === "string" ? error : null)
        || "Unknown Home Assistant WebSocket error";
      this._setStatus(`Could not read automation: ${message}`, true);
    }
  }

  _sendPending() {
    if (!this._pendingMessage || !this._frame?.contentWindow) return;
    this._frame.contentWindow.postMessage(this._pendingMessage, this._targetOrigin);
  }

  _onWindowMessage(event) {
    if (!this._frame?.contentWindow || event.source !== this._frame.contentWindow) return;
    if (event.origin !== this._targetOrigin) return;
    if (event.data?.type === "ha-lens:ready") this._sendPending();
  }

  _setStatus(message, error) {
    if (!this._status) return;
    this._status.textContent = message;
    this._status.dataset.error = error ? "true" : "false";
  }
}

if (!customElements.get("ha-lens-panel")) {
  customElements.define("ha-lens-panel", HaLensPanel);
}
