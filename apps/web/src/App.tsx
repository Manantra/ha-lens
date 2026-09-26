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

type Tab = "summary" | "paths" | "entities" | "trace" | "insights" | "explain";

interface CompanionEntityMetadata {
  name?: string | null;
  icon?: string | null;
  area?: string | null;
  device?: string | null;
}

interface CompanionTraceStep {
  path: string;
  occurrence?: number;
  timestamp?: string | null;
  error?: string | null;
  result?: unknown;
}

interface CompanionTrace {
  runId: string;
  state?: string | null;
  scriptExecution?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastStep?: string | null;
  error?: string | null;
  notTriggered?: boolean;
  paths: string[];
  steps?: CompanionTraceStep[];
}

function tracePathToNodeId(path: string, nodeIds: string[]): string | null {
  const available = new Set(nodeIds);
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return null;

  if (parts[0] === "trigger") parts[0] = "triggers";
  else if (parts[0] === "condition") parts[0] = "conditions";
  else if (parts[0] === "action") parts[0] = "actions";
  else return null;

  while (parts.length) {
    const candidate = parts.join(".");
    if (available.has(candidate)) return candidate;
    parts.pop();
  }

  return null;
}

function traceNodeIds(paths: string[], nodeIds: string[]): Set<string> {
  const output = new Set<string>();
  for (const path of paths) {
    const nodeId = tracePathToNodeId(path, nodeIds);
    if (nodeId) output.add(nodeId);
  }
  return output;
}

function formatTraceResult(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "object") return String(value);

  const record = value as Record<string, unknown>;
  if (typeof record.result === "boolean") return record.result ? "condition: true" : "condition: false";
  if (record.choice != null) return `choice: ${String(record.choice)}`;
  if (record.timeout === true) return "timeout";
  if (record.stop != null) return `stop: ${String(record.stop)}`;
  if (record.delay != null) return `delay: ${String(record.delay)}`;
  if (record.wait && typeof record.wait === "object") {
    const wait = record.wait as Record<string, unknown>;
    if (typeof wait.completed === "boolean") return wait.completed ? "wait completed" : "wait incomplete";
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 180 ? `${serialized.slice(0, 177)}…` : serialized;
  } catch {
    return "runtime result";
  }
}

function formatTraceTime(value?: string | null): string {
  if (!value) return "unknown time";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
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
  const [trace, setTrace] = useState<CompanionTrace | null>(null);
  const [showTrace, setShowTrace] = useState(false);
  const [selectedTraceNodeId, setSelectedTraceNodeId] = useState<string | null>(null);
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
        trace?: CompanionTrace | null;
      };
      if (message.type !== "ha-lens:automation" || !message.config || typeof message.config !== "object") return;

      setYaml(serializeAutomationYaml(message.config));
      setEntityMetadata(message.entityMetadata && typeof message.entityMetadata === "object" ? message.entityMetadata : {});
      setTrace(message.trace && typeof message.trace === "object" ? message.trace : null);
      setShowTrace(Boolean(message.trace));
      setSelectedPath(null);
      setSelectedEntity(null);
      setSelectedTraceNodeId(null);
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
    if (selectedTraceNodeId) return new Set([selectedTraceNodeId]);
    if (selectedEntity && result.ok) return new Set(result.analysis.entityUsages[selectedEntity] ?? []);
    return new Set(selectedPath?.steps.map((step) => step.nodeId) ?? []);
  }, [result, selectedEntity, selectedPath, selectedTraceNodeId]);

  const tracedNodeIds = useMemo(
    () => result.ok && trace && showTrace ? traceNodeIds(trace.paths, result.graph.nodes.map((node) => node.id)) : new Set<string>(),
    [result, showTrace, trace],
  );

  const graphNodeById = useMemo(
    () => result.ok ? new Map(result.graph.nodes.map((node) => [node.id, node])) : new Map(),
    [result],
  );

  const tabs = useMemo<Tab[]>(
    () => trace
      ? ["summary", "paths", "entities", "trace", "insights", "explain"]
      : ["summary", "paths", "entities", "insights", "explain"],
    [trace],
  );

  const sortedEntities = useMemo(() => {
    if (!result.ok) return [];
    return [...result.analysis.entities].sort((left, right) => {
      const leftName = entityMetadata[left]?.name || left;
      const rightName = entityMetadata[right]?.name || right;
      return leftName.localeCompare(rightName, undefined, { sensitivity: "base" });
    });
  }, [entityMetadata, result]);

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
        <div className="presentation__graph"><AutomationGraph graph={result.graph} highlightedNodeIds={highlightedNodeIds} traceNodeIds={tracedNodeIds} /></div>
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
          <button className="ghost" onClick={() => { setYaml(sampleAutomation); setEntityMetadata({}); setTrace(null); setShowTrace(false); setSelectedTraceNodeId(null); }}>Load example</button>
          <button className="ghost" disabled={!result.ok} onClick={() => void copyMermaid()}>{copyStatus === "copied" ? "Mermaid copied ✓" : copyStatus === "failed" ? "Copy failed" : "Copy Mermaid"}</button>
          <button className="ghost" disabled={!result.ok || !!exporting} onClick={() => void handleExport("svg")}>{exporting === "svg" ? "Exporting…" : "Export SVG"}</button>
          <button className="ghost" disabled={!result.ok || !!exporting} onClick={() => void handleExport("png")}>{exporting === "png" ? "Exporting…" : "Export PNG"}</button>
          <button disabled={!result.ok} onClick={() => setPresentation(true)}>Presentation mode</button>
        </div>
      </header>}

      <section className="workspace">
        <aside className="yaml-panel panel">
          <div className="panel__header"><strong>Automation YAML</strong><span>local only</span></div>
          <textarea wrap="off" value={yaml} onChange={(event) => { setYaml(event.target.value); setEntityMetadata({}); setTrace(null); setShowTrace(false); setSelectedTraceNodeId(null); setSelectedPath(null); setSelectedEntity(null); }} spellCheck={false} />
        </aside>

        <section className="graph-panel panel">
          <div className="panel__header">
            <strong>{result.ok ? result.automation.alias : "Automation map"}</strong>
            <div className="panel__header-actions">
              {trace && result.ok && (
                <button
                  className={`trace-toggle ${showTrace ? "is-active" : ""}`}
                  onClick={() => {
                    setSelectedTraceNodeId(null);
                    setShowTrace((value) => !value);
                  }}
                  title="Highlight nodes touched by the latest Home Assistant trace"
                >
                  Last run
                </button>
              )}
              <span>{result.ok ? `${result.paths.length} paths` : "Waiting for valid YAML"}</span>
            </div>
          </div>
          <div className="graph-area">
            {result.ok ? <AutomationGraph graph={result.graph} highlightedNodeIds={highlightedNodeIds} traceNodeIds={tracedNodeIds} /> : <div className="error-state"><strong>YAML could not be parsed</strong><p>{result.error}</p></div>}
          </div>
        </section>

        <aside className="inspector panel">
          <nav className="tabs">
            {tabs.map((item) => (
              <button
                key={item}
                className={tab === item ? "is-active" : ""}
                onClick={() => {
                  if (item === "trace") setShowTrace(true);
                  setSelectedTraceNodeId(null);
                  setTab(item);
                }}
              >
                {item}
              </button>
            ))}
          </nav>
          <div className="inspector__body">
            {!result.ok ? <p>Fix the YAML to unlock analysis.</p> : tab === "summary" ? (
              <>
                <h2>{result.automation.alias}</h2>
                {result.automation.description && <p className="muted">{result.automation.description}</p>}
                {trace && (
                  <div className="trace-card">
                    <div>
                      <strong>Last Home Assistant run</strong>
                      <span>{formatTraceTime(trace.startedAt)}</span>
                    </div>
                    <div className="trace-card__meta">
                      <span>{trace.notTriggered ? "not triggered" : (trace.scriptExecution || trace.state || "recorded")}</span>
                      <span>{trace.paths.length} traced step{trace.paths.length === 1 ? "" : "s"}</span>
                    </div>
                    {trace.error && <div className="trace-card__error">{trace.error}</div>}
                  </div>
                )}
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
                <div className="entity-section-heading">
                  <h3>Entities</h3>
                  <span>{sortedEntities.length}</span>
                </div>
                <div className="entity-list">
                  {sortedEntities.length ? sortedEntities.map((entity) => {
                    const metadata = entityMetadata[entity];
                    const displayName = metadata?.name && metadata.name !== entity ? metadata.name : entity;
                    const usageCount = result.analysis.entityUsages[entity]?.length ?? 0;
                    return (
                      <button
                        key={entity}
                        className={`entity-card ${selectedEntity === entity ? "is-active" : ""}`}
                        onClick={() => {
                          setSelectedTraceNodeId(null);
                          setSelectedPath(null);
                          setSelectedEntity(selectedEntity === entity ? null : entity);
                        }}
                      >
                        <span className="entity-card__main">
                          <strong>{displayName}</strong>
                          <code>{entity}</code>
                          {(metadata?.area || metadata?.device) && (
                            <span className="entity-card__meta">
                              {metadata.area && <small><b>Area</b>{metadata.area}</small>}
                              {metadata.device && <small><b>Device</b>{metadata.device}</small>}
                            </span>
                          )}
                        </span>
                        <span className="entity-card__usage" title={`Referenced by ${usageCount} graph node${usageCount === 1 ? "" : "s"}`}>
                          <strong>{usageCount}</strong>
                          <small>{usageCount === 1 ? "node" : "nodes"}</small>
                        </span>
                      </button>
                    );
                  }) : <div className="empty-state">No static entity IDs found.</div>}
                </div>
                {selectedEntity && (
                  <div className="notice entity-selection-notice">
                    Highlighting references to <code>{selectedEntity}</code> in the graph.
                  </div>
                )}
                <div className="entity-section-heading entity-section-heading--actions">
                  <h3>Actions</h3>
                  <span>{result.analysis.actions.length}</span>
                </div>
                <div className="action-list">
                  {result.analysis.actions.length
                    ? result.analysis.actions.map((action) => <code key={action}>{action}</code>)
                    : <div className="empty-state">No service actions found.</div>}
                </div>
              </>
            ) : tab === "trace" && trace ? (
              <div className="trace-inspector">
                <div className="trace-overview">
                  <div><span>Started</span><strong>{formatTraceTime(trace.startedAt)}</strong></div>
                  <div><span>Finished</span><strong>{trace.finishedAt ? formatTraceTime(trace.finishedAt) : "still running / unknown"}</strong></div>
                  <div><span>Result</span><strong>{trace.notTriggered ? "not triggered" : (trace.scriptExecution || trace.state || "recorded")}</strong></div>
                  <div><span>Last step</span><strong>{trace.lastStep || "unknown"}</strong></div>
                </div>
                {trace.error && <div className="trace-card__error">{trace.error}</div>}
                <div className="trace-toolbar">
                  <span>{trace.steps?.length ?? trace.paths.length} runtime event{(trace.steps?.length ?? trace.paths.length) === 1 ? "" : "s"}</span>
                  <button
                    className="ghost trace-clear"
                    onClick={() => {
                      setSelectedTraceNodeId(null);
                      setShowTrace(true);
                    }}
                  >
                    Show full run
                  </button>
                </div>
                <div className="trace-step-list">
                  {(trace.steps?.length
                    ? trace.steps
                    : trace.paths.map((path): CompanionTraceStep => ({ path }))
                  ).map((step, index) => {
                    const nodeId = tracePathToNodeId(step.path, result.graph.nodes.map((node) => node.id));
                    const node = nodeId ? graphNodeById.get(nodeId) : undefined;
                    const resultText = formatTraceResult(step.result);
                    const selected = Boolean(nodeId && selectedTraceNodeId === nodeId);
                    return (
                      <button
                        key={`${step.path}-${step.occurrence ?? index}-${index}`}
                        className={`trace-step ${selected ? "is-active" : ""} ${nodeId ? "" : "is-unmapped"}`}
                        onClick={() => {
                          if (!nodeId) return;
                          setSelectedPath(null);
                          setSelectedEntity(null);
                          setSelectedTraceNodeId(selected ? null : nodeId);
                          setShowTrace(true);
                        }}
                      >
                        <span className="trace-step__number">{index + 1}</span>
                        <span className="trace-step__body">
                          <strong>{node?.label || step.path}</strong>
                          <code>{step.path}</code>
                          {(resultText || step.error) && (
                            <small className={step.error ? "trace-step__error" : ""}>
                              {step.error || resultText}
                            </small>
                          )}
                        </span>
                        <span className="trace-step__time">{step.timestamp ? new Date(step.timestamp).toLocaleTimeString() : nodeId ? "mapped" : "unmapped"}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="privacy">Trace data comes from Home Assistant's local trace API. HA Lens does not execute the automation.</p>
              </div>
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
