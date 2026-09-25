import { useMemo, useState } from "react";
import { analyzeAutomation } from "@ha-lens/analyzer";
import { buildAutomationGraph } from "@ha-lens/graph";
import { parseAutomationYaml } from "@ha-lens/parser";
import { enumerateExecutionPaths } from "@ha-lens/paths";
import type { ExecutionPath } from "@ha-lens/model";
import { AutomationGraph } from "./AutomationGraph";
import { sampleAutomation } from "./sample";

type Tab = "summary" | "paths" | "entities" | "insights";

export function App() {
  const [yaml, setYaml] = useState(sampleAutomation);
  const [tab, setTab] = useState<Tab>("summary");
  const [selectedPath, setSelectedPath] = useState<ExecutionPath | null>(null);
  const [presentation, setPresentation] = useState(false);

  const result = useMemo(() => {
    try {
      const parsed = parseAutomationYaml(yaml);
      const analysis = analyzeAutomation(parsed.automation);
      const paths = enumerateExecutionPaths(parsed.automation);
      const graph = buildAutomationGraph(parsed.automation);
      return { ok: true as const, ...parsed, analysis, paths, graph };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Unable to parse YAML" };
    }
  }, [yaml]);

  const highlightedNodeIds = useMemo(() => new Set(selectedPath?.steps.map((step) => step.nodeId) ?? []), [selectedPath]);

  if (presentation && result.ok) {
    return (
      <main className="presentation">
        <header className="presentation__header">
          <div><span className="brand-mark">◉</span> HA Lens <strong>{result.automation.alias}</strong></div>
          <button onClick={() => setPresentation(false)}>Exit presentation</button>
        </header>
        <div className="presentation__graph"><AutomationGraph graph={result.graph} highlightedNodeIds={highlightedNodeIds} /></div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand"><span className="brand-mark">◉</span> HA Lens <span className="badge">v0.1</span></div>
          <div className="tagline">See what your Home Assistant automation can do.</div>
        </div>
        <div className="topbar__actions">
          <button className="ghost" onClick={() => setYaml(sampleAutomation)}>Load example</button>
          <button disabled={!result.ok} onClick={() => setPresentation(true)}>Presentation mode</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="yaml-panel panel">
          <div className="panel__header"><strong>Automation YAML</strong><span>local only</span></div>
          <textarea value={yaml} onChange={(event) => { setYaml(event.target.value); setSelectedPath(null); }} spellCheck={false} />
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
            {(["summary", "paths", "entities", "insights"] as Tab[]).map((item) => (
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
                  <button key={path.id} className={`path-card ${selectedPath?.id === path.id ? "is-active" : ""}`} onClick={() => setSelectedPath(selectedPath?.id === path.id ? null : path)}>
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
                <div className="token-list">{result.analysis.entities.length ? result.analysis.entities.map((entity) => <code key={entity}>{entity}</code>) : <span className="muted">No static entity IDs found.</span>}</div>
                <h3>Actions</h3>
                <div className="token-list">{result.analysis.actions.map((action) => <code key={action}>{action}</code>)}</div>
              </>
            ) : (
              <>
                <div className="section-intro">These are structural observations, not validation errors.</div>
                {result.analysis.insights.length ? result.analysis.insights.map((insight, index) => <div className={`insight insight--${insight.level}`} key={`${insight.nodeId}-${index}`}>{insight.message}</div>) : <div className="empty-state">No structural insights for this automation.</div>}
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
