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
    this._relatedCache = new Map();
    this._iconPathCache = new Map();
    this._automationItems = [];
    this._automationListPromise = null;
    this._diagnosticsText = "";
    this._filterQuery = "";
    this._targetOrigin = window.location.origin;
    this._channelNonce = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
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
    const version = this._panel?.config?.version;
    if (version) url.searchParams.set("v", String(version));
    url.searchParams.set("embedded", "1");
    url.searchParams.set("channel", this._channelNonce);
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
        <iframe title="HA Lens automation analyzer" sandbox="allow-scripts allow-downloads"></iframe>
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
    if (!this._hass?.states) return;
    if (this._automationListPromise) return this._automationListPromise;

    this._automationListPromise = Promise.resolve()
      .then(() => {
        const states = Object.values(this._hass.states || {})
          .filter((state) => typeof state?.entity_id === "string" && state.entity_id.startsWith("automation."));

        this._automationItems = states
          .map((state) => ({
            entityId: state.entity_id,
            name: state.attributes?.friendly_name || state.entity_id,
            unavailable: state.state === "unavailable",
          }))
          .sort((left, right) => left.name.localeCompare(right.name));

        const unavailable = this._automationItems.filter((item) => item.unavailable).length;
        const available = this._automationItems.length - unavailable;
        const diagnostics = [`${available} available`];
        if (unavailable > 0) diagnostics.push(`${unavailable} unavailable`);
        diagnostics.push(`${this._automationItems.length} loaded by Home Assistant`);
        this._diagnosticsText = diagnostics.join(" · ");

        this._syncAutomations();
        this._setStatus(
          this._automationItems.length
            ? `Read-only · ${this._diagnosticsText}`
            : "No automations loaded by Home Assistant",
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
      option.textContent = automation.unavailable ? `⚠ ${automation.name}` : automation.name;
      if (automation.unavailable) option.title = "Home Assistant reports this automation as unavailable";
      this._select.append(option);
    }

    if (visible.some((automation) => automation.entityId === previous)) {
      this._select.value = previous;
      this._selected = previous;
    }
  }

  async _automationConfig(entityId) {
    if (!this._hass?.callWS) throw new Error("Home Assistant WebSocket API is unavailable.");
    const config = await this._hass.callWS({
      type: "automation/config",
      entity_id: entityId,
    });
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error(`Home Assistant did not return a readable config for ${entityId}.`);
    }
    return config;
  }

  async _automationRelated(entityId) {
    if (!this._hass?.callWS) return {};
    if (this._relatedCache.has(entityId)) return this._relatedCache.get(entityId);

    const promise = this._hass.callWS({
      type: "search/related",
      item_type: "automation",
      item_id: entityId,
    }).catch((error) => {
      console.warn("HA Lens could not load Home Assistant related references", error);
      return {};
    });
    this._relatedCache.set(entityId, promise);
    return promise;
  }

  _compactString(value, maxLength = 600) {
    if (value == null) return null;
    const text = String(value);
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }

  _compactTarget(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const output = {};
    for (const key of ["entity_id", "device_id", "area_id", "floor_id", "label_id"]) {
      const raw = value[key];
      const values = (Array.isArray(raw) ? raw : [raw])
        .filter((item) => typeof item === "string" && item.length > 0)
        .slice(0, 100)
        .map((item) => this._compactString(item, 300));
      if (values.length) output[key] = values;
    }
    return Object.keys(output).length ? output : null;
  }

  _compactTraceResult(value) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      if (["string", "number", "boolean"].includes(typeof value)) return value;
      return null;
    }

    const output = {};
    if (typeof value.result === "boolean") output.result = value.result;
    if (["string", "number", "boolean"].includes(typeof value.choice)) {
      output.choice = typeof value.choice === "string" ? this._compactString(value.choice, 160) : value.choice;
    }
    if (typeof value.timeout === "boolean") output.timeout = value.timeout;
    if (["string", "number", "boolean"].includes(typeof value.stop)) output.stop = this._compactString(value.stop, 300);
    if (["string", "number", "boolean"].includes(typeof value.delay)) output.delay = this._compactString(value.delay, 160);
    if (value.wait && typeof value.wait === "object" && typeof value.wait.completed === "boolean") {
      output.wait = { completed: value.wait.completed };
    }
    if (typeof value.domain === "string") output.domain = this._compactString(value.domain, 120);
    if (typeof value.service === "string") output.service = this._compactString(value.service, 120);
    const target = this._compactTarget(value.target);
    if (target) output.target = target;
    return Object.keys(output).length ? output : null;
  }

  _isDirectScriptAction(value) {
    return (
      typeof value === "string"
      && value.startsWith("script.")
      && !["script.turn_on", "script.turn_off", "script.toggle", "script.reload"].includes(value)
    );
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
            if (
              typeof entityId === "string"
              && (
                /^[a-z0-9_]+\.[a-z0-9_]+$/i.test(entityId)
                || /^[a-f0-9]{20,}$/i.test(entityId)
              )
            ) {
              output.add(entityId);
            }
          }
        }
        if (key === "scene" && typeof child === "string" && /^[a-z0-9_]+\.[a-z0-9_]+$/i.test(child)) {
          output.add(child);
        }
        if ((key === "action" || key === "service") && this._isDirectScriptAction(child)) {
          output.add(child);
        }
        this._collectEntityIds(child, output);
      }
    }

    return output;
  }

  async _registryData() {
    if (!this._hass?.callWS) return { areas: [], devices: [], entities: [], floors: [], labels: [] };

    if (!this._registryPromise) {
      this._registryPromise = Promise.all([
        this._hass.callWS({ type: "config/area_registry/list" }),
        this._hass.callWS({ type: "config/device_registry/list" }),
        this._hass.callWS({ type: "config/entity_registry/list" }),
        this._hass.callWS({ type: "config/floor_registry/list" }),
        this._hass.callWS({ type: "config/label_registry/list" }),
      ])
        .then(([areas, devices, entities, floors, labels]) => ({ areas, devices, entities, floors, labels }))
        .catch((error) => {
          console.warn("HA Lens could not load registry metadata", error);
          return { areas: [], devices: [], entities: [], floors: [], labels: [] };
        });
    }

    return this._registryPromise;
  }

  async _traceDetails(itemId, summary) {
    if (!summary?.run_id) return null;
    const extended = await this._hass.callWS({
      type: "trace/get",
      domain: "automation",
      item_id: itemId,
      run_id: summary.run_id,
    });

    const traceEntries = Object.entries(extended?.trace || {});
    const allSteps = traceEntries
      .flatMap(([path, entries]) =>
        (Array.isArray(entries) ? entries : []).map((entry, occurrence) => {
          const repeatIndex = entry?.changed_variables?.repeat?.index;
          return {
            path: this._compactString(path, 500),
            occurrence,
            repeatIndex: Number.isInteger(repeatIndex) && repeatIndex > 0 ? repeatIndex : null,
            timestamp: entry?.timestamp || null,
            error: this._compactString(entry?.error, 1000),
            result: this._compactTraceResult(entry?.result),
            targets: this._compactTarget(entry?.result?.params?.target ?? entry?.result?.target),
          };
        })
      )
      .sort((left, right) => {
        const timeOrder = String(left.timestamp || "").localeCompare(String(right.timestamp || ""));
        return timeOrder || left.path.localeCompare(right.path) || left.occurrence - right.occurrence;
      });

    const stepLimit = 2000;
    return {
      runId: extended?.run_id || summary.run_id,
      state: this._compactString(extended?.state || summary?.state, 120),
      scriptExecution: this._compactString(extended?.script_execution ?? summary?.script_execution, 120),
      startedAt: extended?.timestamp?.start || summary?.timestamp?.start || null,
      finishedAt: extended?.timestamp?.finish || summary?.timestamp?.finish || null,
      lastStep: this._compactString(extended?.last_step ?? summary?.last_step, 500),
      error: this._compactString(extended?.error || summary?.error, 1000),
      notTriggered: Boolean(extended?.not_triggered ?? summary?.not_triggered),
      paths: traceEntries.slice(0, stepLimit).map(([path]) => this._compactString(path, 500)),
      steps: allSteps.slice(0, stepLimit),
      truncated: allSteps.length > stepLimit || traceEntries.length > stepLimit,
    };
  }

  async _latestTraces(automation) {
    if (!automation?.automationId || !this._hass?.callWS) {
      return { execution: null, diagnostic: null };
    }

    try {
      const itemId = String(automation.automationId);
      const traces = await this._hass.callWS({
        type: "trace/list",
        domain: "automation",
        item_id: itemId,
      });
      if (!Array.isArray(traces) || !traces.length) {
        return { execution: null, diagnostic: null };
      }

      const ordered = [...traces].sort((left, right) =>
        String(right?.timestamp?.start || "").localeCompare(String(left?.timestamp?.start || ""))
      );

      let execution = null;
      let diagnostic = null;
      for (const summary of ordered.slice(0, 12)) {
        if (execution && diagnostic) break;
        const detail = await this._traceDetails(itemId, summary);
        if (!detail) continue;
        if (detail.notTriggered) {
          diagnostic ||= detail;
        } else {
          execution ||= detail;
        }
      }

      return { execution, diagnostic };
    } catch (error) {
      console.warn("HA Lens could not load automation traces", error);
      return { execution: null, diagnostic: null };
    }
  }

  _cacheIcon(key, value) {
    if (this._iconPathCache.has(key)) this._iconPathCache.delete(key);
    this._iconPathCache.set(key, value);
    while (this._iconPathCache.size > 512) {
      const oldestKey = this._iconPathCache.keys().next().value;
      this._iconPathCache.delete(oldestKey);
    }
  }

  async _mapLimit(items, limit, mapper) {
    const results = new Array(items.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await mapper(items[index], index);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
    return results;
  }

  async _readResolvedIcon(element, timeoutMs = 2500) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      try {
        if (element.updateComplete) await Promise.race([
          element.updateComplete,
          new Promise((resolve) => setTimeout(resolve, 80)),
        ]);
      } catch (_error) {
        // Ignore render-cycle errors and keep polling until timeout.
      }

      const directSvg = element.shadowRoot?.querySelector("ha-svg-icon");
      const nestedHaIcon = element.shadowRoot?.querySelector("ha-icon");
      const nestedSvg = nestedHaIcon?.shadowRoot?.querySelector("ha-svg-icon");
      const svgIcon = nestedSvg || directSvg;

      if (svgIcon?.path) {
        return {
          icon: nestedHaIcon?.icon || element.icon || null,
          path: svgIcon.path,
          secondaryPath: svgIcon.secondaryPath || null,
          viewBox: svgIcon.viewBox || "0 0 24 24",
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 30));
    }

    return null;
  }

  async _resolveEntityIcon(state, iconOverride) {
    const entityId = state?.entity_id || "";
    const stateValue = state?.state || "";
    const deviceClass = state?.attributes?.device_class || "";
    const cacheKey = [entityId, stateValue, deviceClass, iconOverride || ""].join("|");
    if (this._iconPathCache.has(cacheKey)) return this._iconPathCache.get(cacheKey);

    let element = null;
    if (state && customElements.get("ha-state-icon")) {
      element = document.createElement("ha-state-icon");
      element.stateObj = state;
      if (iconOverride) element.icon = iconOverride;
    } else if (iconOverride && customElements.get("ha-icon")) {
      element = document.createElement("ha-icon");
      element.icon = iconOverride;
    }

    if (!element) {
      this._cacheIcon(cacheKey, null);
      return null;
    }

    element.setAttribute("aria-hidden", "true");
    element.style.cssText = "position:absolute;left:-10000px;top:-10000px;width:24px;height:24px;visibility:hidden;pointer-events:none;";
    this.shadowRoot.append(element);

    try {
      const resolved = await this._readResolvedIcon(element);
      this._cacheIcon(cacheKey, resolved);
      return resolved;
    } finally {
      element.remove();
    }
  }

  _deviceAreaId(device, devicesById) {
    let current = device;
    const visited = new Set();
    for (let depth = 0; current && depth < 8; depth += 1) {
      if (current.area_id) return current.area_id;
      if (!current.parent_device_id || visited.has(current.parent_device_id)) break;
      visited.add(current.parent_device_id);
      current = devicesById.get(current.parent_device_id);
    }
    return null;
  }

  async _entityMetadata(config, related = {}, registryData = null) {
    const entityIds = this._collectEntityIds(config);
    for (const entityId of related?.entity || []) {
      if (typeof entityId === "string") entityIds.add(entityId);
    }
    const { areas, devices, entities } = registryData || await this._registryData();

    const areasById = new Map(areas.map((area) => [area.area_id, area]));
    const devicesById = new Map(devices.map((device) => [device.id, device]));
    const entitiesById = new Map(entities.map((entity) => [entity.entity_id, entity]));
    const entitiesByRegistryId = new Map(
      entities
        .filter((entity) => typeof entity.id === "string" && entity.id)
        .map((entity) => [entity.id, entity])
    );

    const entries = await this._mapLimit([...entityIds].slice(0, 5000), 6, async (entityId) => {
      const registry = entitiesById.get(entityId) || entitiesByRegistryId.get(entityId);
      const resolvedEntityId = registry?.entity_id || (/^[a-z0-9_]+\.[a-z0-9_]+$/i.test(entityId) ? entityId : null);
      const state = resolvedEntityId ? this._hass?.states?.[resolvedEntityId] : null;
      const device = registry?.device_id ? devicesById.get(registry.device_id) : null;
      const areaId = registry?.area_id || this._deviceAreaId(device, devicesById);
      const area = areaId ? areasById.get(areaId) : null;

      const iconOverride = registry?.icon || state?.attributes?.icon || null;
      const resolvedIcon = await this._resolveEntityIcon(state, iconOverride);
      return [entityId, {
        entityId: resolvedEntityId,
        name: registry?.name || state?.attributes?.friendly_name || registry?.original_name || resolvedEntityId || entityId,
        icon: resolvedIcon?.icon || iconOverride,
        iconPath: resolvedIcon?.path || null,
        iconSecondaryPath: resolvedIcon?.secondaryPath || null,
        iconViewBox: resolvedIcon?.viewBox || null,
        area: area?.name || null,
        device: device?.name_by_user || device?.name || null,
      }];
    });

    return Object.fromEntries(entries);
  }

  _targetIds(config, related = {}) {
    const kinds = {
      entity: new Set(related?.entity || []),
      device: new Set(related?.device || []),
      area: new Set(related?.area || []),
      floor: new Set(related?.floor || []),
      label: new Set(related?.label || []),
    };
    const keyMap = {
      entity_id: "entity",
      device_id: "device",
      area_id: "area",
      floor_id: "floor",
      label_id: "label",
    };
    const visit = (value) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        const kind = keyMap[key];
        if (kind) {
          const values = Array.isArray(child) ? child : [child];
          for (const id of values) {
            if (typeof id === "string" && id.length <= 300) kinds[kind].add(id);
          }
        }
        visit(child);
      }
    };
    visit(config);
    return kinds;
  }

  _targetMetadata(config, related, registryData, entityMetadata) {
    const ids = this._targetIds(config, related);
    const areas = new Map((registryData?.areas || []).map((item) => [item.area_id, item]));
    const devices = new Map((registryData?.devices || []).map((item) => [item.id, item]));
    const floors = new Map((registryData?.floors || []).map((item) => [item.floor_id, item]));
    const labels = new Map((registryData?.labels || []).map((item) => [item.label_id, item]));
    const output = {};
    const add = (kind, id, name) => {
      output[kind] ||= {};
      output[kind][id] = { name: this._compactString(name || id, 300) };
    };

    for (const id of [...ids.entity].slice(0, 5000)) add("entity", id, entityMetadata?.[id]?.name || id);
    for (const id of [...ids.device].slice(0, 5000)) {
      const item = devices.get(id);
      add("device", id, item?.name_by_user || item?.name || id);
    }
    for (const id of [...ids.area].slice(0, 5000)) add("area", id, areas.get(id)?.name || id);
    for (const id of [...ids.floor].slice(0, 5000)) add("floor", id, floors.get(id)?.name || id);
    for (const id of [...ids.label].slice(0, 5000)) add("label", id, labels.get(id)?.name || id);
    return output;
  }

  async _loadAutomation(entityId) {
    if (!this._hass?.callWS) {
      this._setStatus("Home Assistant WebSocket API is unavailable.", true);
      return;
    }

    this._setStatus("Loading automation…", false);

    try {
      const selected = this._automations().find((automation) => automation.entityId === entityId);
      const config = await this._automationConfig(entityId);
      const automationId = config?.id != null ? String(config.id) : null;
      const [related, traces, registryData] = await Promise.all([
        this._automationRelated(entityId),
        this._latestTraces({ automationId }),
        this._registryData(),
      ]);
      const entityMetadata = await this._entityMetadata(config, related, registryData);
      const targetMetadata = this._targetMetadata(config, related, registryData, entityMetadata);

      this._pendingMessage = {
        type: "ha-lens:automation",
        version: 2,
        entityId,
        config,
        entityMetadata,
        targetMetadata,
        automationReferences: related,
        trace: traces.execution,
        triggerDiagnostic: traces.diagnostic,
        homeAssistantUnavailable: Boolean(selected?.unavailable),
      };

      this._sendPending();
      const selectedLabel = selected ? selected.name : entityId;
      const availabilityLabel = selected?.unavailable ? " · unavailable in Home Assistant" : "";
      this._setStatus(
        this._diagnosticsText
          ? `${selectedLabel}${availabilityLabel} · ${this._diagnosticsText}`
          : `${selectedLabel}${availabilityLabel}`,
        Boolean(selected?.unavailable),
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
    this._frame.contentWindow.postMessage(
      { ...this._pendingMessage, nonce: this._channelNonce },
      "*",
    );
  }

  _onWindowMessage(event) {
    if (!this._frame?.contentWindow || event.source !== this._frame.contentWindow) return;
    if (event.data?.nonce !== this._channelNonce) return;
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
