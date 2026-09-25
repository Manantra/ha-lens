import { useEffect, useMemo, useState } from "react";
import { analyzeAutomation, explainAutomation } from "@ha-lens/analyzer";
import { buildAutomationGraph } from "@ha-lens/graph";
import { automationGraphToMermaid } from "@ha-lens/exporter";
import { parseAutomationYaml, serializeAutomationYaml } from "@ha-lens/parser";
import { enumerateExecutionPaths } from "@ha-lens/paths";
import type { ExecutionPath } from "@ha-lens/model";
import { exportAutomationGraph, type GraphExportFormat } from "./exportGraph";
import { AutomationGraph } from "./AutomationGraph";
import { sampleAutomation } from "./sample";

type Tab = "summary" | "paths" | "entities" | "insights" | "explain";

interface CompanionEntityMetadata {
  name?: string | null;
  icon?: string | null;
  area?: string | null;
  device?: string | null;
}

export function App() {
  const [yaml, setYaml] = useState(sampleAutomation);
  const [tab, setTab] = useState<Tab>("summary");
  const [selectedPath, setSelectedPath] = useState<ExecutionPath | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [presentation, setPresentation] = useState(false);
  const [exporting, setExporting] = useState<GraphExportFormat | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [entityMetadata, setEntityMetadata] = useState<Record<string, CompanionEntityMetadata>>({});
  const embedded = useMemo(() => new URLSearchParams(window.location.search).get("embedded") === "1", []);

  useEffect(() => {
    if (window.parent === window) return;

    let parentOrigin: string | null = null;
    try {
      parentOrigin = document.referrer ? new URL(document.referrer).origin : null;
    } catch {
      parentOrigin = null;
    }

    const receiveAutomation = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent) return;
      if (parentOrigin && event.origin !== parentOrigin) return;
      if (!event.data || typeof event.data !== "object") return;

      const message = event.data as {
        type?: string;
        config?: unknown;
        entityMetadata?: Record<string, CompanionEntityMetadata>;
      };
      if (message.type !== "ha-lens:automation" || !message.config || typeof message.config !== "object") return;

      setYaml(serializeAutomationYaml(message.config));
      setEntityMetadata(message.entityMetadata && typeof message.entityMetadata === "object" ? message.entityMetadata : {});
      setSelectedPath(null);
      setSelectedEntity(null);
      setTab("summary");
    };

    window.addEventListener("message", receiveAutomation);
    window.parent.postMessage({ type: "ha-lens:ready", version: 1 }, parentOrigin ?? "*");

    return () => window.removeEventListener("message", receiveAutomation);
  }, []);

  const result = useMemo(() => {
    try {
      const parsed = parseAutomationYaml(yaml);
      const analysis = analyzeAutomation(parsed.automation);
      const paths = enumerateExecutionPaths(parsed.automation);
      const graph = buildAutomationGraph(parsed.automation);
      const explanation = explainAutomation(parsed.automation);
      return { ok: true as const, ...parsed, analysis, paths, graph, explanation };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Unable to parse YAML" };
    }
  }, [yaml]);

  const highlightedNodeIds = useMemo(() => {
    if (selectedEntity && result.ok) return new Set(result.analysis.entityUsages[selectedEntity] ?? []);
    return new Set(selectedPath?.steps.map((step) => step.nodeId) ?? []);
  }, [result, selectedEntity, selectedPath]);

  async function copyMermaid() {
    if (!result.ok) return;
    try {
      await navigator.clipboard.writeText(automationGraphToMermaid(result.graph, result.automation.alias));
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 1800);
    } catch (error) {
      console.error("HA Lens Mermaid copy failed", error);
      setCopyStatus("failed");
      window.setTimeout(() => setCopyStatus("idle"), 2400);
    }
  }

  async function handleExport(format: GraphExportFormat) {
    if (!result.ok) return;
    try {
      setExporting(format);
      await exportAutomationGraph(result.automation.alias, format);
    } catch (error) {
      console.error("HA Lens export failed", error);
    } finally {
      setExporting(null);
    }
  }

  if (presentation && result.ok) {
    return (
      <main className="presentation">
        <header className="presentation__header">
          <div><span className="brand-mark">◉</span> HA Lens <strong>{result.automation.alias}</strong></div>
          <div className="topbar__actions">
            <button className="ghost" onClick={() => void copyMermaid()}>{copyStatus === "copied" ? "Mermaid copied ✓" : "Copy Mermaid"}</button>
            <button className="ghost" disabled={!!exporting} onClick={() => void handleExport("svg")}>{exporting === "svg" ? "Exporting…" : "Export SVG"}</button>
            <button className="ghost" disabled={!!exporting} onClick={() => void handleExport("png")}>{exporting === "png" ? "Exporting…" : "Export PNG"}</button>
            <button onClick={() => setPresentation(false)}>Exit presentation</button>
          </div>
        </header>
        <div className="presentation__graph"><AutomationGraph graph={result.graph} highlightedNodeIds={highlightedNodeIds} /></div>
      </main>
    );
  }

  return (
    <main className={embedded ? "app-shell app-shell--embedded" : "app-shell"}>
      {!embedded && <header className="topbar">
        <div>
          <div className="brand"><span className="brand-mark">◉</span> HA Lens <span className="badge">v0.1</span></div>
          <div className="tagline">See what your Home Assistant automation can do.</div>
        </div>
        <div className="topbar__actions">
          <button className="ghost" onClick={() => { setYaml(sampleAutomation); setEntityMetadata({}); }}>Load example</button>
          <button className="ghost" disabled={!result.ok} onClick={() => void copyMermaid()}>{copyStatus === "copied" ? "Mermaid copied ✓" : copyStatus === "failed" ? "Copy failed" : "Copy Mermaid"}</button>
          <button className="ghost" disabled={!result.ok || !!exporting} onClick={() => void handleExport("svg")}>{exporting === "svg" ? "Exporting…" : "Export SVG"}</button>
          <button className="ghost" disabled={!result.ok || !!exporting} onClick={() => void handleExport("png")}>{exporting === "png" ? "Exporting…" : "Export PNG"}</button>
          <button disabled={!result.ok} onClick={() => setPresentation(true)}>Presentation mode</button>
        </div>
      </header>}

      <section className="workspace">
        <aside className="yaml-panel panel">
          <div className="panel__header"><strong>Automation YAML</strong><span>local only</span></div>
          <textarea value={yaml} onChange={(event) => { setYaml(event.target.value); setEntityMetadata({}); setSelectedPath(null); setSelectedEntity(null); }} spellCheck={false} />
        </aside>

        <section className="graph-panel panel">
          <div className="panel__header">
            <strong>{result.ok ? result.automation.alias : "Automation map"}</strong>
            <span>{result.ok ? `${result.paths.length} paths` : "Waiting for valid YAML"}</span>
          </div>
          <div className="graph-area">
            {result.ok ? <AutomationGraph graph={result.graph} highlightedNodeIds={highlightedNodeIds} /> : <div className="error-state"><strong>YAML could not be parsed</strong><p>{result.error}</p></div>}
          </div>
        </section>

        <aside className="inspector panel">
          <nav className="tabs">
            {(["summary", "paths", "entities", "insights", "explain"] as Tab[]).map((item) => (
              <button key={item} className={tab === item ? "is-active" : ""} onClick={() => setTab(item)}>{item}</button>
            ))}
          </nav>
          <div className="inspector__body">
            {!result.ok ? <p>Fix the YAML to unlock analysis.</p> : tab === "summary" ? (
              <>
                <h2>{result.automation.alias}</h2>
                {result.automation.description && <p className="muted">{result.automation.description}</p>}
                <div className="stat-grid">
                  {Object.entries(result.analysis.stats).map(([key, value]) => <div className="stat" key={key}><strong>{value}</strong><span>{key.replace(/([A-Z])/g, " $1")}</span></div>)}
                </div>
                {result.warnings.map((warning) => <div className="notice" key={warning}>{warning}</div>)}
                <p className="privacy">Analysis runs in your browser. HA Lens does not execute this automation.</p>
              </>
            ) : tab === "paths" ? (
              <div className="path-list">
                <div className="section-intro">Select a path to highlight it in the map.</div>
                {result.paths.map((path) => (
                  <button key={path.id} className={`path-card ${selectedPath?.id === path.id ? "is-active" : ""}`} onClick={() => { setSelectedEntity(null); setSelectedPath(selectedPath?.id === path.id ? null : path); }}>
                    <span className={`outcome outcome--${path.outcome}`}>{path.outcome}</span>
                    <strong>{path.title}</strong>
                    <span>{path.steps.length} steps</span>
                  </button>
                ))}
                {selectedPath && <ol className="path-steps">{selectedPath.steps.map((step, index) => <li key={`${step.nodeId}-${index}`}><strong>{step.label}</strong>{step.detail && <span>{step.detail}</span>}</li>)}</ol>}
              </div>
            ) : tab === "entities" ? (
              <>
                <h3>Entities</h3>
                <div className="token-list">
                  {result.analysis.entities.length ? result.analysis.entities.map((entity) => {
                    const metadata = entityMetadata[entity];
                    const context = [metadata?.area, metadata?.device, metadata?.icon].filter(Boolean).join(" · ");
                    return (
                      <button
                        key={entity}
                        className={`entity-token ${selectedEntity === entity ? "is-active" : ""}`}
                        onClick={() => { setSelectedPath(null); setSelectedEntity(selectedEntity === entity ? null : entity); }}
                      >
                        <span className="entity-token__identity">
                          <code>{entity}</code>
                          {metadata?.name && metadata.name !== entity && <small>{metadata.name}</small>}
                          {context && <small className="entity-token__context">{context}</small>}
                        </span>
                        <span>{result.analysis.entityUsages[entity]?.length ?? 0} node{(result.analysis.entityUsages[entity]?.length ?? 0) === 1 ? "" : "s"}</span>
                      </button>
                    );
                  }) : <span className="muted">No static entity IDs found.</span>}
                </div>
                {selectedEntity && <div className="notice">Highlighting every graph node that references <code>{selectedEntity}</code>.</div>}
                <h3>Actions</h3>
                <div className="token-list">{result.analysis.actions.map((action) => <code key={action}>{action}</code>)}</div>
              </>
            ) : tab === "insights" ? (
              <>
                <div className="section-intro">These are structural observations, not validation errors.</div>
                {result.analysis.insights.length ? result.analysis.insights.map((insight, index) => <div className={`insight insight--${insight.level}`} key={`${insight.nodeId}-${index}`}>{insight.message}</div>) : <div className="empty-state">No structural insights for this automation.</div>}
              </>
            ) : (
              <>
                <div className="section-intro">A deterministic explanation generated from the parsed automation structure. No AI or cloud processing is used.</div>
                <div className="explanation-list">
                  {result.explanation.map((line, index) => <p key={index}><span>{index + 1}</span>{line}</p>)}
                </div>
              </>
            )}
          </div>
        </aside>
      </section>

      <footer className={`statusbar ${result.ok ? "statusbar--ok" : "statusbar--error"}`}>
        {result.ok ? `Parsed successfully · ${result.analysis.entities.length} entities · ${result.paths.length} execution paths · ${result.analysis.stats.decisionPoints} decision points` : result.error}
      </footer>
    </main>
  );
}
