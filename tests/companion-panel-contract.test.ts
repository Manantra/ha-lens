import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panelSource = readFileSync(
  new URL("../custom_components/ha_lens/frontend/ha-lens-panel.js", import.meta.url),
  "utf8",
);

describe("Home Assistant companion WebSocket contracts", () => {
  it("unwraps the official automation/config response before using the automation config", () => {
    expect(panelSource).toContain('type: "automation/config"');
    expect(panelSource).toMatch(/const\s+config\s*=\s*response\?\.config;/);
    expect(panelSource).not.toMatch(/const\s+config\s*=\s*await\s+this\._hass\.callWS\(\{\s*type:\s*"automation\/config"/s);
  });

  it("uses the selected automation entity id for search/related", () => {
    expect(panelSource).toContain('type: "search/related"');
    expect(panelSource).toContain('item_type: "automation"');
    expect(panelSource).toContain("item_id: entityId");
  });

  it("keeps execution traces separate from not-triggered diagnostics", () => {
    expect(panelSource).toContain("summary?.not_triggered !== true");
    expect(panelSource).toContain("summary?.not_triggered === true");
    expect(panelSource).toContain("triggerDiagnostic: traces.diagnostic");
  });

  it("shows the version Home Assistant actually loaded", () => {
    expect(panelSource).toContain('class="version"');
    expect(panelSource).toContain("this._panel?.config?.version");
    expect(panelSource).toContain("Loaded HA Lens integration version");
  });

  it("keeps the viewer sandbox isolated while loading from the CORS-enabled viewer endpoint", () => {
    expect(panelSource).toContain('const DEFAULT_VIEWER_URL = "/ha_lens_viewer/index.html"');
    expect(panelSource).toContain('sandbox="allow-scripts allow-downloads"');
    expect(panelSource).not.toContain("allow-same-origin");
  });


  it("uses a nonce-authenticated MessageChannel for the sandboxed viewer with a bounded fallback", () => {
    expect(panelSource).toContain("new MessageChannel()");
    expect(panelSource).toContain('type: "ha-lens:channel"');
    expect(panelSource).toContain('type === "ha-lens:channel-request"');
    expect(panelSource).toContain("this._messagePort.postMessage(message)");
    expect(panelSource).toContain("event.data?.nonce !== this._channelNonce");
  });

  it("surfaces Home Assistant 2026.10.1 trace-storage constraints and the loaded HA version", () => {
    expect(panelSource).toContain('unavailableReason: "automation_without_id"');
    expect(panelSource).toContain("traceUnavailableReason: traces.unavailableReason");
    expect(panelSource).toContain("homeAssistantVersion:");
    expect(panelSource).toContain("this._hass?.config?.version");
  });

});
