import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeAutomation, explainAutomation } from "@ha-lens/analyzer";
import { buildAutomationGraph } from "@ha-lens/graph";
import { automationGraphToMermaid } from "@ha-lens/exporter";
import { parseAutomationYaml, serializeAutomationYaml } from "@ha-lens/parser";
import { enumerateExecutionPaths } from "@ha-lens/paths";
import type { ExecutionPath } from "@ha-lens/model";
import { exportAutomationGraph, type GraphExportFormat } from "./exportGraph";
import { AutomationGraph, type GraphEntityIcon, type TraceNodeBadge } from "./AutomationGraph";
import {
  buildTraceSemanticLabels,
  buildTraceBreadcrumb,
  buildTraceCoverage,
  tracePathToNodeId,
  tracePathToSemanticId,
} from "./traceMapping";
import { sampleAutomation } from "./sample";
import { buildAutomationDiff } from "./automationDiff";
import { createAutomationSnapshot, parseAutomationSnapshot, serializeAutomationSnapshot, snapshotFilename } from "./snapshot";
import { lintAutomation } from "./lint";
import { LANGUAGE_CODES, LANGUAGE_LABELS, localizeNarrative, normalizeLanguage, translate, type Language } from "./i18n";
import {
  sanitizeAutomationReferences,
  sanitizeCompanionTrace,
  sanitizeTargetMetadata,
  type CompanionTargetMetadata,
  type CompanionTrace,
  type CompanionTraceStep,
  type TargetMap,
} from "./companionPayload";

type Tab = "summary" | "paths" | "entities" | "diff" | "trace" | "insights" | "lint" | "explain";
type GraphFitMode = "all" | "width";

interface CompanionEntityMetadata {
  entityId?: string | null;
  name?: string | null;
  icon?: string | null;
  iconPath?: string | null;
  iconSecondaryPath?: string | null;
  iconViewBox?: string | null;
  area?: string | null;
  device?: string | null;
}



function formatTraceResult(value: unknown, language: Language): string | null {
  if (value == null) return null;
  if (typeof value !== "object") return String(value);

  const record = value as Record<string, unknown>;
  if (typeof record.result === "boolean") return translate(record.result ? "condition: true" : "condition: false", language);
  if (record.choice != null) return `${translate("choice", language)}: ${String(record.choice)}`;
  if (record.timeout === true) return translate("timeout", language);
  if (record.stop != null) return `${translate("stop", language)}: ${String(record.stop)}`;
  if (record.delay != null) return `${translate("delay", language)}: ${String(record.delay)}`;
  if (record.wait && typeof record.wait === "object") {
    const wait = record.wait as Record<string, unknown>;
    if (typeof wait.completed === "boolean") return translate(wait.completed ? "wait completed" : "wait incomplete", language);
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 180 ? `${serialized.slice(0, 177)}…` : serialized;
  } catch {
    return translate("runtime result", language);
  }
}

function formatTraceTime(value: string | null | undefined, language: Language): string {
  if (!value) return translate("unknown time", language);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(language);
}

function EntityIcon({
  entityId,
  icon,
  iconPath,
  iconSecondaryPath,
  iconViewBox,
}: {
  entityId: string;
  icon?: string | null;
  iconPath?: string | null;
  iconSecondaryPath?: string | null;
  iconViewBox?: string | null;
}) {
  const domain = entityId.split(".", 1)[0];
  const hint = `${icon || ""} ${domain}`.toLowerCase();

  if (iconPath) {
    return (
      <span className="entity-card__icon entity-card__icon--ha" title={icon || `${domain} entity`}>
        <svg viewBox={iconViewBox || "0 0 24 24"} aria-hidden="true">
          <path d={iconPath} />
          {iconSecondaryPath && <path className="entity-card__icon-secondary" d={iconSecondaryPath} />}
        </svg>
      </span>
    );
  }

  const common = { viewBox: "0 0 24 24", "aria-hidden": true } as const;
  let glyph;
  if (/motion|occupancy|presence|binary_sensor/.test(hint)) {
    glyph = <><circle cx="12" cy="12" r="2.2" /><path d="M7.5 8.2a6 6 0 0 0 0 7.6M16.5 8.2a6 6 0 0 1 0 7.6M4.5 5.7a10 10 0 0 0 0 12.6M19.5 5.7a10 10 0 0 1 0 12.6" /></>;
  } else if (/light|bulb/.test(hint)) {
    glyph = <><path d="M9 18h6M10 21h4M8.7 14.8C7 13.7 6 11.8 6 9.7A6 6 0 0 1 18 9.7c0 2.1-1 4-2.7 5.1-.8.5-1.3 1.3-1.3 2.2h-4c0-.9-.5-1.7-1.3-2.2Z" /></>;
  } else if (/temperature|therm|climate/.test(hint)) {
    glyph = <><path d="M10 5a2 2 0 0 1 4 0v8.2a4 4 0 1 1-4 0V5Z" /><path d="M12 8v7" /></>;
  } else if (/person|account/.test(hint)) {
    glyph = <><circle cx="12" cy="8" r="3" /><path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6" /></>;
  } else if (/switch|input_boolean/.test(hint)) {
    glyph = <><rect x="4" y="7" width="16" height="10" rx="5" /><circle cx="15" cy="12" r="3" /></>;
  } else if (/water|humidity|moisture/.test(hint)) {
    glyph = <><path d="M12 3s5 5.7 5 10a5 5 0 0 1-10 0c0-4.3 5-10 5-10Z" /></>;
  } else {
    glyph = <><circle cx="12" cy="12" r="7.5" /><path d="M8 14.5 11 12l2 1.5 3-4" /></>;
  }

  return (
    <span className="entity-card__icon" title={icon || `${domain} entity`}>
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{glyph}</svg>
    </span>
  );
}

export function App() {
  const [yaml, setYaml] = useState(sampleAutomation);
  const [baselineYaml, setBaselineYaml] = useState(sampleAutomation);
  const [tab, setTab] = useState<Tab>("summary");
  const [language, setLanguage] = useState<Language>(() =>
    normalizeLanguage(new URLSearchParams(window.location.search).get("lang") || navigator.language));
  const t = (key: string) => translate(key, language);
  const [selectedPath, setSelectedPath] = useState<ExecutionPath | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [presentation, setPresentation] = useState(false);
  const [yamlCollapsed, setYamlCollapsed] = useState(false);
  const [graphFitMode, setGraphFitMode] = useState<GraphFitMode>("all");
  const [exporting, setExporting] = useState<GraphExportFormat | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [snapshotStatus, setSnapshotStatus] = useState<"idle" | "saved" | "loaded" | "error">("idle");
  const snapshotInputRef = useRef<HTMLInputElement>(null);
  const [entityMetadata, setEntityMetadata] = useState<Record<string, CompanionEntityMetadata>>({});
  const [targetMetadata, setTargetMetadata] = useState<CompanionTargetMetadata>({});
  const [automationReferences, setAutomationReferences] = useState<Record<string, string[]>>({});
  const [trace, setTrace] = useState<CompanionTrace | null>(null);
  const [triggerDiagnostic, setTriggerDiagnostic] = useState<CompanionTrace | null>(null);
  const [homeAssistantUnavailable, setHomeAssistantUnavailable] = useState(false);
  const [homeAssistantVersion, setHomeAssistantVersion] = useState<string | null>(null);
  const [traceUnavailableReason, setTraceUnavailableReason] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState(false);
  const [selectedTraceNodeId, setSelectedTraceNodeId] = useState<string | null>(null);
  const [selectedDiffNodeId, setSelectedDiffNodeId] = useState<string | null>(null);
  const [lintEnabled, setLintEnabled] = useState(false);
  const embedded = useMemo(() => new URLSearchParams(window.location.search).get("embedded") === "1", []);
  const channelNonce = useMemo(() => new URLSearchParams(window.location.search).get("channel"), []);

  useEffect(() => {
    if (window.parent === window) return;

    let parentOrigin: string | null = null;
    try {
      parentOrigin = document.referrer ? new URL(document.referrer).origin : null;
    } catch {
      parentOrigin = null;
    }

    let channelPort: MessagePort | null = null;

    const applyAutomationMessage = (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const message = data as {
        type?: string;
        nonce?: string;
        config?: unknown;
        entityMetadata?: Record<string, CompanionEntityMetadata>;
        targetMetadata?: CompanionTargetMetadata;
        automationReferences?: Record<string, string[]>;
        trace?: CompanionTrace | null;
        triggerDiagnostic?: CompanionTrace | null;
        traceUnavailableReason?: string | null;
        homeAssistantUnavailable?: boolean;
        homeAssistantVersion?: string | null;
        language?: string | null;
      };
      if (message.type === "ha-lens:locale" && message.nonce === channelNonce) {
        if (message.language) setLanguage(normalizeLanguage(message.language));
        return;
      }
      if (message.type !== "ha-lens:automation" || message.nonce !== channelNonce || !message.config || typeof message.config !== "object" || Array.isArray(message.config)) return;

      const source = serializeAutomationYaml(message.config);
      if (source.length > 2_000_000) return;
      if (message.language) setLanguage(normalizeLanguage(message.language));
      setYaml(source);
      setBaselineYaml(source);
      const metadata = message.entityMetadata && typeof message.entityMetadata === "object"
        ? Object.fromEntries(Object.entries(message.entityMetadata).slice(0, 5000))
        : {};
      const references = sanitizeAutomationReferences(message.automationReferences);
      setEntityMetadata(metadata);
      setTargetMetadata(sanitizeTargetMetadata(message.targetMetadata));
      setAutomationReferences(references);
      const sanitizedTrace = sanitizeCompanionTrace(message.trace);
      setTrace(sanitizedTrace);
      setTriggerDiagnostic(sanitizeCompanionTrace(message.triggerDiagnostic));
      setTraceUnavailableReason(
        ["automation_without_id", "trace_api_error", "websocket_unavailable"].includes(String(message.traceUnavailableReason))
          ? String(message.traceUnavailableReason)
          : null,
      );
      setHomeAssistantUnavailable(Boolean(message.homeAssistantUnavailable));
      setHomeAssistantVersion(typeof message.homeAssistantVersion === "string" ? message.homeAssistantVersion.slice(0, 80) : null);
      setShowTrace(Boolean(sanitizedTrace));
      setSelectedPath(null);
      setSelectedEntity(null);
      setSelectedTraceNodeId(null);
      setSelectedDiffNodeId(null);
      setLintEnabled(false);
      setTab("summary");
    };

    const receiveAutomation = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent) return;
      if (parentOrigin && event.origin !== parentOrigin) return;
      if (!event.data || typeof event.data !== "object") return;
      const bootstrap = event.data as { type?: string; nonce?: string };
      if (bootstrap.type === "ha-lens:channel" && bootstrap.nonce === channelNonce && event.ports?.[0]) {
        channelPort?.close();
        channelPort = event.ports[0];
        channelPort.onmessage = (portEvent) => applyAutomationMessage(portEvent.data);
        channelPort.start();
        channelPort.postMessage({ type: "ha-lens:ready", version: 3, nonce: channelNonce });
        return;
      }
      applyAutomationMessage(event.data);
    };

    window.addEventListener("message", receiveAutomation);
    if (channelNonce) {
      window.parent.postMessage({ type: "ha-lens:channel-request", version: 3, nonce: channelNonce }, parentOrigin ?? "*");
    }

    return () => {
      window.removeEventListener("message", receiveAutomation);
      channelPort?.close();
    };
  }, [channelNonce]);

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

  const baselineResult = useMemo(() => {
    try {
      const parsed = parseAutomationYaml(baselineYaml);
      return {
        ok: true as const,
        ...parsed,
        graph: buildAutomationGraph(parsed.automation),
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Unable to parse baseline YAML",
      };
    }
  }, [baselineYaml]);

  const automationDiff = useMemo(
    () => result.ok && baselineResult.ok
      ? buildAutomationDiff(
          baselineResult.automation,
          result.automation,
          baselineResult.graph,
          result.graph,
        )
      : null,
    [baselineResult, result],
  );

  const diffActive = tab === "diff" && Boolean(automationDiff);

  const entityFocusNodeIds = useMemo(
    () => selectedEntity && result.ok
      ? new Set(result.analysis.entityUsages[selectedEntity] ?? [])
      : new Set<string>(),
    [result, selectedEntity],
  );

  const highlightedNodeIds = useMemo(() => {
    if (diffActive && selectedDiffNodeId) return new Set([selectedDiffNodeId]);
    if (selectedTraceNodeId) return new Set([selectedTraceNodeId]);
    if (entityFocusNodeIds.size) return entityFocusNodeIds;
    return new Set(selectedPath?.steps.map((step) => step.nodeId) ?? []);
  }, [diffActive, entityFocusNodeIds, selectedDiffNodeId, selectedPath, selectedTraceNodeId]);

  const traceCoverage = useMemo(
    () => result.ok && trace
      ? buildTraceCoverage(
          trace.steps ?? trace.paths.map((path) => ({ path })),
          result.graph,
        )
      : null,
    [result, trace],
  );

  const tracedNodeIds = showTrace && traceCoverage
    ? traceCoverage.executedNodeIds
    : new Set<string>();

  const tracedEdgeIds = showTrace && traceCoverage
    ? traceCoverage.executedEdgeIds
    : new Set<string>();

  const traceNotTakenEdgeIds = showTrace && traceCoverage
    ? traceCoverage.notTakenEdgeIds
    : new Set<string>();

  const traceNodeBadges = useMemo(() => {
    const badges = new Map<string, TraceNodeBadge>();
    if (!showTrace || !traceCoverage) return badges;

    for (const [nodeId, count] of traceCoverage.repeatIterationCounts) {
      badges.set(nodeId, {
        label: `${count} ${t(count === 1 ? "iteration" : "iterations")}`,
        tone: count > 0 ? "good" : "neutral",
      });
    }

    for (const [nodeId, coverage] of traceCoverage.parallelBranchCoverage) {
      const observed = coverage.observedBranchIndexes.size;
      const total = coverage.totalBranches;
      badges.set(nodeId, {
        label: `${observed}/${total} ${t("branches")}`,
        tone: total > 0 && observed === total ? "good" : "partial",
      });
    }

    return badges;
  }, [showTrace, traceCoverage, language]);

  const graphNodeById = useMemo(
    () => result.ok ? new Map(result.graph.nodes.map((node) => [node.id, node])) : new Map(),
    [result],
  );

  const traceSemanticLabels = useMemo(
    () => result.ok ? buildTraceSemanticLabels(result.automation) : new Map<string, string>(),
    [result],
  );

  const inspectorTrace = trace ?? triggerDiagnostic;
  const tabLabel: Record<Tab, string> = { summary: "Summary", paths: "Paths", entities: "Entities", diff: "Diff", trace: "Trace", insights: "Insights", lint: "Lint", explain: "Explain" };
  const inspectorTraceIsDiagnostic = !trace && Boolean(triggerDiagnostic);

  const tabs = useMemo<Tab[]>(
    () => inspectorTrace
      ? ["summary", "paths", "entities", "diff", "trace", "insights", "lint", "explain"]
      : ["summary", "paths", "entities", "diff", "insights", "lint", "explain"],
    [inspectorTrace],
  );

  const lintIssues = useMemo(
    () => result.ok && lintEnabled ? lintAutomation(result.automation) : [],
    [lintEnabled, result],
  );

  const sortedEntities = useMemo(() => {
    if (!result.ok) return [];
    return [...result.analysis.entities].sort((left, right) => {
      const leftName = entityMetadata[left]?.name || left;
      const rightName = entityMetadata[right]?.name || right;
      return leftName.localeCompare(rightName, undefined, { sensitivity: "base" });
    });
  }, [entityMetadata, result]);

  const unifiedTargets = useMemo(() => {
    if (!result.ok) return [];
    const staticTargets = new Map<string, Set<string>>();
    for (const target of result.analysis.targets) {
      staticTargets.set(target.kind, new Set(target.ids));
    }

    const kinds = new Set([
      ...staticTargets.keys(),
      ...Object.keys(automationReferences),
    ]);
    return [...kinds]
      .flatMap((kind) => {
        const staticIds = staticTargets.get(kind) ?? new Set<string>();
        const haIds = new Set(automationReferences[kind] ?? []);
        return [...new Set([...staticIds, ...haIds])].map((id) => ({
          kind,
          id,
          staticResolved: staticIds.has(id),
          homeAssistantResolved: haIds.has(id),
        }));
      })
      .sort((left, right) => {
        const kindOrder = left.kind.localeCompare(right.kind);
        if (kindOrder) return kindOrder;
        const leftName = targetMetadata[left.kind]?.[left.id]?.name || left.id;
        const rightName = targetMetadata[right.kind]?.[right.id]?.name || right.id;
        return leftName.localeCompare(rightName, undefined, { sensitivity: "base" });
      });
  }, [automationReferences, result, targetMetadata]);

  const graphNodeEntityIcons = useMemo(() => {
    const icons = new Map<string, GraphEntityIcon[]>();
    if (!result.ok) return icons;

    for (const entityId of result.analysis.entities) {
      const metadata = entityMetadata[entityId];
      if (!metadata?.iconPath) continue;

      const icon: GraphEntityIcon = {
        entityId: metadata.entityId || entityId,
        label: metadata.name || metadata.entityId || entityId,
        icon: metadata.icon || null,
        path: metadata.iconPath,
        secondaryPath: metadata.iconSecondaryPath || null,
        viewBox: metadata.iconViewBox || "0 0 24 24",
      };

      for (const nodeId of result.analysis.entityUsages[entityId] ?? []) {
        const current = icons.get(nodeId) ?? [];
        if (!current.some((item) => item.entityId === icon.entityId)) {
          current.push(icon);
          icons.set(nodeId, current);
        }
      }
    }

    return icons;
  }, [entityMetadata, result]);

  const entityFocus = useMemo(() => {
    if (!result.ok || !selectedEntity) return null;
    const metadata = entityMetadata[selectedEntity];
    const nodeIds = result.analysis.entityUsages[selectedEntity] ?? [];
    const details = result.analysis.entityUsageDetails[selectedEntity] ?? [];
    return {
      entityId: metadata?.entityId || selectedEntity,
      name: metadata?.name && metadata.name !== selectedEntity ? metadata.name : (metadata?.entityId || selectedEntity),
      nodeCount: nodeIds.length,
      referenceCount: details.length,
      details,
    };
  }, [entityMetadata, result, selectedEntity]);

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

  function resetCompanionContext() {
    setEntityMetadata({});
    setTargetMetadata({});
    setAutomationReferences({});
    setTrace(null);
    setTriggerDiagnostic(null);
    setHomeAssistantUnavailable(false);
    setShowTrace(false);
    setSelectedTraceNodeId(null);
    setSelectedDiffNodeId(null);
    setSelectedPath(null);
    setSelectedEntity(null);
    setLintEnabled(false);
  }

  function exportSnapshot() {
    if (!result.ok) return;
    try {
      const snapshot = createAutomationSnapshot(yaml, result.automation.alias);
      const blob = new Blob([serializeAutomationSnapshot(snapshot)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = snapshotFilename(result.automation.alias);
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSnapshotStatus("saved");
      window.setTimeout(() => setSnapshotStatus("idle"), 1800);
    } catch (error) {
      console.error("HA Lens snapshot export failed", error);
      setSnapshotStatus("error");
      window.setTimeout(() => setSnapshotStatus("idle"), 2600);
    }
  }

  async function importSnapshot(file: File | undefined) {
    if (!file) return;
    try {
      const snapshot = parseAutomationSnapshot(await file.text());
      setYaml(snapshot.automation.yaml);
      setBaselineYaml(snapshot.automation.yaml);
      resetCompanionContext();
      setTab("summary");
      setSnapshotStatus("loaded");
      window.setTimeout(() => setSnapshotStatus("idle"), 1800);
    } catch (error) {
      console.error("HA Lens snapshot import failed", error);
      setSnapshotStatus("error");
      window.setTimeout(() => setSnapshotStatus("idle"), 3200);
    } finally {
      if (snapshotInputRef.current) snapshotInputRef.current.value = "";
    }
  }

  if (presentation && result.ok) {
    return (
      <main className="presentation">
        <header className="presentation__header">
          <div><span className="brand-mark">◉</span> HA Lens <strong>{result.automation.alias}</strong></div>
          <div className="topbar__actions">
            <button className="ghost" onClick={() => void copyMermaid()}>{t(copyStatus === "copied" ? "Mermaid copied ✓" : "Copy Mermaid")}</button>
            <button className="ghost" disabled={!!exporting} onClick={() => void handleExport("svg")}>{t(exporting === "svg" ? "Exporting…" : "Export SVG")}</button>
            <button className="ghost" disabled={!!exporting} onClick={() => void handleExport("png")}>{t(exporting === "png" ? "Exporting…" : "Export PNG")}</button>
            <button onClick={() => setPresentation(false)}>{t("Exit presentation")}</button>
          </div>
        </header>
        <div className="presentation__graph"><AutomationGraph language={language} graph={result.graph} highlightedNodeIds={highlightedNodeIds} traceNodeIds={tracedNodeIds} traceEdgeIds={tracedEdgeIds} traceNotTakenEdgeIds={traceNotTakenEdgeIds} traceNodeBadges={traceNodeBadges} nodeEntityIcons={graphNodeEntityIcons} traceCoverageActive={Boolean(trace && showTrace)} focusNodeIds={entityFocusNodeIds} fitMode={graphFitMode} /></div>
      </main>
    );
  }

  return (
    <main className={embedded ? "app-shell app-shell--embedded" : "app-shell"}>
      {!embedded && <header className="topbar">
        <div>
          <div className="brand"><span className="brand-mark">◉</span> HA Lens <span className="badge">v0.1</span></div>
          <div className="tagline">{t("See what your Home Assistant automation can do.")}</div>
        </div>
        <div className="topbar__actions">
          <select aria-label={t("Language")} value={language} onChange={(event) => setLanguage(normalizeLanguage(event.target.value))} style={{maxWidth: 135, flex: "0 0 auto"}}>
            {LANGUAGE_CODES.map((code) => <option key={code} value={code}>{LANGUAGE_LABELS[code]}</option>)}
          </select>
          <button className="ghost" onClick={() => { setYaml(sampleAutomation); setBaselineYaml(sampleAutomation); setEntityMetadata({}); setTargetMetadata({}); setAutomationReferences({}); setTrace(null); setTriggerDiagnostic(null); setHomeAssistantUnavailable(false); setShowTrace(false); setSelectedTraceNodeId(null); setSelectedDiffNodeId(null); setLintEnabled(false); }}>{t("Load example")}</button>
          <button className="ghost" disabled={!result.ok} onClick={() => void copyMermaid()}>{t(copyStatus === "copied" ? "Mermaid copied ✓" : copyStatus === "failed" ? "Copy failed" : "Copy Mermaid")}</button>
          <button className="ghost" disabled={!result.ok || !!exporting} onClick={() => void handleExport("svg")}>{t(exporting === "svg" ? "Exporting…" : "Export SVG")}</button>
          <button className="ghost" disabled={!result.ok || !!exporting} onClick={() => void handleExport("png")}>{t(exporting === "png" ? "Exporting…" : "Export PNG")}</button>
          <button disabled={!result.ok} onClick={() => setPresentation(true)}>{t("Presentation mode")}</button>
        </div>
      </header>}

      <section className={`workspace ${yamlCollapsed ? "workspace--yaml-collapsed" : ""}`}>
        <aside className="yaml-panel panel">
          <div className="panel__header">
            <strong>{t("Automation YAML")}</strong>
            <div className="yaml-panel__tools">
              <span>{t(snapshotStatus === "saved" ? "snapshot saved ✓" : snapshotStatus === "loaded" ? "snapshot loaded ✓" : snapshotStatus === "error" ? "snapshot failed" : "local only")}</span>
              <input
                ref={snapshotInputRef}
                className="snapshot-input"
                type="file"
                accept=".json,.ha-lens.json,application/json"
                onChange={(event) => void importSnapshot(event.target.files?.[0])}
              />
              <button className="ghost snapshot-tool" disabled={!result.ok} onClick={exportSnapshot} title={t("Save only this automation YAML as a local HA Lens snapshot")}>{t("Save snapshot")}</button>
              <button className="ghost snapshot-tool" onClick={() => snapshotInputRef.current?.click()} title={t("Open a local HA Lens snapshot; no data is uploaded")}>{t("Open snapshot")}</button>
              <button
                className="ghost yaml-toggle"
                onClick={() => setYamlCollapsed(true)}
                title={t("Hide automation YAML and give the graph more space")}
              >
                {t("Hide YAML")}
              </button>
            </div>
          </div>
          <textarea wrap="off" value={yaml} onChange={(event) => { setYaml(event.target.value); setEntityMetadata({}); setTargetMetadata({}); setAutomationReferences({}); setTrace(null); setTriggerDiagnostic(null); setHomeAssistantUnavailable(false); setShowTrace(false); setSelectedTraceNodeId(null); setSelectedDiffNodeId(null); setSelectedPath(null); setSelectedEntity(null); setLintEnabled(false); }} spellCheck={false} />
        </aside>

        <section className="graph-panel panel">
          <div className="panel__header">
            <strong>{result.ok ? result.automation.alias : t("Automation map")}</strong>
            <div className="panel__header-actions">
              <div className="graph-fit-controls" aria-label={t("Graph fit mode")}>
                <button
                  className={`ghost fit-toggle ${graphFitMode === "all" ? "is-active" : ""}`}
                  onClick={() => setGraphFitMode("all")}
                  title={t("Fit the complete graph into the available canvas")}
                >
                  {t("Fit all")}
                </button>
                <button
                  className={`ghost fit-toggle ${graphFitMode === "width" ? "is-active" : ""}`}
                  onClick={() => setGraphFitMode("width")}
                  title={t("Fit graph to the available width; pan vertically for tall automations")}
                >
                  {t("Fit width")}
                </button>
              </div>
              {yamlCollapsed && (
                <button
                  className="ghost yaml-toggle"
                  onClick={() => setYamlCollapsed(false)}
                  title={t("Show automation YAML")}
                >
                  {t("Show YAML")}
                </button>
              )}
              {trace && result.ok && (
                <div className="run-view-controls" aria-label={t("Graph view mode")}>
                  <button
                    className={`trace-toggle ${!showTrace ? "is-active is-structure" : ""}`}
                    onClick={() => {
                      setSelectedTraceNodeId(null);
                      setShowTrace(false);
                    }}
                    title={t("Show the complete static automation structure")}
                  >
                    {t("Structure")}
                  </button>
                  <button
                    className={`trace-toggle ${showTrace ? "is-active" : ""}`}
                    onClick={() => {
                      setSelectedTraceNodeId(null);
                      setShowTrace(true);
                    }}
                    title={t("Compare the latest Home Assistant run with the static structure")}
                  >
                    {t("Last run")}
                  </button>
                </div>
              )}
              <span>{result.ok ? `${result.paths.length} ${t("paths")}` : t("Waiting for valid YAML")}</span>
            </div>
          </div>
          <div className={`graph-area ${entityFocus ? "has-entity-focus" : ""}`}>
            {entityFocus && (
              <div className="entity-focus-banner">
                <div className="entity-focus-banner__icon">◎</div>
                <div className="entity-focus-banner__body">
                  <strong>{t("Entity focus active")} · {entityFocus.name}</strong>
                  <span>
                    {entityFocus.nodeCount} {t("matching graph nodes highlighted")}
                    {entityFocus.referenceCount !== entityFocus.nodeCount ? ` · ${entityFocus.referenceCount} ${t("specific references")}` : ""}.
                    {t("Unrelated nodes are dimmed.")}
                  </span>
                  <code>{entityFocus.entityId}</code>
                </div>
                <button className="entity-focus-banner__clear" onClick={() => setSelectedEntity(null)}>{t("Clear focus")}</button>
              </div>
            )}
            <div className="graph-canvas">
              {diffActive && automationDiff && (
                <div className="diff-legend" aria-label={t("Automation diff legend")}>
                  <span><i className="diff-dot is-added" />{t("Added")}</span>
                  <span><i className="diff-dot is-changed" />{t("Changed")}</span>
                  <span><i className="diff-dot is-removed" />{t("Removed")}</span>
                </div>
              )}
              {trace && showTrace && result.ok && !diffActive && (
                <div className="run-coverage-legend" aria-label={t("Last run coverage legend")}>
                  <span><i className="run-coverage-dot is-executed" />{t("Executed")}</span>
                  <span><i className="run-coverage-line is-not-taken" />{t("Branch not taken")}</span>
                  <span><i className="run-coverage-dot is-not-reached" />{t("Not reached")}</span>
                </div>
              )}
              {result.ok ? <AutomationGraph
                language={language}
                graph={diffActive && automationDiff ? automationDiff.graph : result.graph}
                highlightedNodeIds={highlightedNodeIds}
                traceNodeIds={tracedNodeIds}
                traceEdgeIds={tracedEdgeIds}
                traceNotTakenEdgeIds={traceNotTakenEdgeIds}
                traceNodeBadges={traceNodeBadges}
                nodeEntityIcons={graphNodeEntityIcons}
                traceCoverageActive={Boolean(trace && showTrace && !diffActive)}
                diffNodeStates={diffActive && automationDiff ? automationDiff.nodeStates : undefined}
                diffEdgeStates={diffActive && automationDiff ? automationDiff.edgeStates : undefined}
                diffActive={diffActive}
                focusNodeIds={entityFocusNodeIds}
                refitKey={yamlCollapsed || diffActive}
                fitMode={graphFitMode}
              /> : <div className="error-state"><strong>{t("YAML could not be parsed")}</strong><p>{result.error}</p></div>}
            </div>
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
                  if (item === "diff") {
                    setSelectedPath(null);
                    setSelectedEntity(null);
                  }
                  setSelectedTraceNodeId(null);
                  setSelectedDiffNodeId(null);
                  setTab(item);
                }}
              >
                {t(tabLabel[item])}
              </button>
            ))}
          </nav>
          <div className="inspector__body">
            {!result.ok ? <p>{t("Fix the YAML to unlock analysis.")}</p> : tab === "summary" ? (
              <>
                <h2>{result.automation.alias}</h2>
                {result.automation.description && <p className="muted">{result.automation.description}</p>}
                {homeAssistantVersion && (
                  <div className="ha-version-note">Home Assistant {homeAssistantVersion}</div>
                )}
                {homeAssistantUnavailable && (
                  <div className="notice notice--warning">{t("Home Assistant currently marks this automation as unavailable. HA Lens can still inspect the raw configuration, but the automation is not runnable in Home Assistant until its validation issue is resolved.")}</div>
                )}
                {traceUnavailableReason === "automation_without_id" && !trace && !triggerDiagnostic && (
                  <div className="notice">
                    {t("Home Assistant does not store automation traces when this automation has no configuration ID. Since 2026.10.1 this is intentional Core behavior, so Last run coverage is unavailable until an ID is present.")}
                  </div>
                )}
                {traceUnavailableReason === "trace_api_error" && !trace && !triggerDiagnostic && (
                  <div className="notice notice--warning">{t("Home Assistant's trace API could not be read for this automation. Static analysis remains available.")}</div>
                )}
                {trace && (
                  <div className="trace-card">
                    <div>
                      <strong>{t("Last Home Assistant execution")}</strong>
                      <span>{formatTraceTime(trace.startedAt, language)}</span>
                    </div>
                    <div className="trace-card__meta">
                      <span>{trace.scriptExecution || trace.state || t("recorded")}</span>
                      <span>{trace.paths.length} {t("traced steps")}</span>
                    </div>
                    {trace.error && <div className="trace-card__error">{trace.error}</div>}
                  </div>
                )}
                {triggerDiagnostic && (
                  <div className="trace-card trace-card--diagnostic">
                    <div>
                      <strong>{t("Latest trigger diagnostic")}</strong>
                      <span>{formatTraceTime(triggerDiagnostic.startedAt, language)}</span>
                    </div>
                    <div className="trace-card__meta">
                      <span>{t("not triggered")}</span>
                      <span>{triggerDiagnostic.lastStep || t("trigger evaluated")}</span>
                    </div>
                    <p className="trace-card__diagnostic-copy">{t("Home Assistant evaluated a trigger but did not start the automation. This diagnostic is intentionally excluded from Last run coverage.")}</p>
                    {triggerDiagnostic.error && <div className="trace-card__error">{triggerDiagnostic.error}</div>}
                  </div>
                )}
                <div className="stat-grid">
                  {Object.entries(result.analysis.stats).map(([key, value]) => <div className="stat" key={key}><strong>{value}</strong><span>{t(key.replace(/([A-Z])/g, " $1").toLowerCase())}</span></div>)}
                </div>
                {result.warnings.map((warning) => <div className="notice" key={warning}>{warning}</div>)}
                <p className="privacy">{t("Analysis runs in your browser. HA Lens does not execute this automation.")}</p>
              </>
            ) : tab === "paths" ? (
              <div className="path-list">
                <div className="section-intro">{t("Select a path to highlight it in the map.")}</div>
                {result.paths.map((path) => (
                  <button key={path.id} className={`path-card ${selectedPath?.id === path.id ? "is-active" : ""}`} onClick={() => { setSelectedEntity(null); setSelectedPath(selectedPath?.id === path.id ? null : path); }}>
                    <span className={`outcome outcome--${path.outcome}`}>{t(path.outcome)}</span>
                    <strong>{localizeNarrative(path.title, language)}</strong>
                    <span>{path.steps.length} {t("steps")}</span>
                  </button>
                ))}
                {selectedPath && <ol className="path-steps">{selectedPath.steps.map((step, index) => <li key={`${step.nodeId}-${index}`}><strong>{localizeNarrative(step.label, language)}</strong>{step.detail && <span>{localizeNarrative(step.detail, language)}</span>}</li>)}</ol>}
              </div>
            ) : tab === "entities" ? (
              <>
                <div className="entity-section-heading">
                  <h3>{t("Entities")}</h3>
                  <span>{sortedEntities.length}</span>
                </div>
                <div className="entity-list">
                  {sortedEntities.length ? sortedEntities.map((entity) => {
                    const metadata = entityMetadata[entity];
                    const displayName = metadata?.name && metadata.name !== entity ? metadata.name : entity;
                    const usageCount = result.analysis.entityUsages[entity]?.length ?? 0;
                    const usageDetails = result.analysis.entityUsageDetails[entity] ?? [];
                    const referenceCount = usageDetails.length;
                    const focused = selectedEntity === entity;
                    return (
                      <button
                        key={entity}
                        className={`entity-card ${focused ? "is-active" : ""}`}
                        onClick={() => {
                          setSelectedTraceNodeId(null);
                          setSelectedPath(null);
                          setSelectedEntity(focused ? null : entity);
                        }}
                      >
                        <EntityIcon
                          entityId={metadata?.entityId || entity}
                          icon={metadata?.icon}
                          iconPath={metadata?.iconPath}
                          iconSecondaryPath={metadata?.iconSecondaryPath}
                          iconViewBox={metadata?.iconViewBox}
                        />
                        <span className="entity-card__main">
                          <span className="entity-card__title-row">
                            <strong>{displayName}</strong>
                          </span>
                          <code>{metadata?.entityId || entity}</code>
                          {(focused || metadata?.area || metadata?.device) && (
                            <span className="entity-card__meta">
                              {focused && <small className="entity-card__focused-badge">{t("Focused")}</small>}
                              {metadata?.area && <small><b>{t("Area")}</b>{metadata.area}</small>}
                              {metadata?.device && <small><b>{t("Device")}</b>{metadata.device}</small>}
                            </span>
                          )}
                          {focused && usageDetails.length > 0 && (
                            <span className="entity-card__contexts">
                              <b>{t("Used at")}</b>
                              {usageDetails.map((detail, index) => (
                                <small key={`${detail.nodeId}-${detail.context}-${index}`}>{detail.context}</small>
                              ))}
                            </span>
                          )}
                        </span>
                        <span className="entity-card__usage" aria-label={`${usageCount} ${t(usageCount === 1 ? "graph node" : "graph nodes")}, ${referenceCount} ${t(referenceCount === 1 ? "reference" : "references")}`}>
                          <span className="entity-card__usage-metric">
                            <strong>{usageCount}</strong>
                            <small>{t(usageCount === 1 ? "graph node" : "graph nodes")}</small>
                          </span>
                          <span className="entity-card__usage-metric">
                            <strong>{referenceCount}</strong>
                            <small>{t(referenceCount === 1 ? "reference" : "references")}</small>
                          </span>
                        </span>
                      </button>
                    );
                  }) : <div className="empty-state">{t("No static entity IDs found.")}</div>}
                </div>
                <div className="entity-section-heading entity-section-heading--actions">
                  <h3>{t("Actions")}</h3>
                  <span>{result.analysis.actions.length}</span>
                </div>
                <div className="action-list">
                  {result.analysis.actions.length
                    ? result.analysis.actions.map((action) => <code key={action}>{action}</code>)
                    : <div className="empty-state">{t("No service actions found.")}</div>}
                </div>
                <div className="entity-section-heading entity-section-heading--actions">
                  <h3>{t("Targets")}</h3>
                  <span>{unifiedTargets.length}</span>
                </div>
                <div className="target-list">
                  {unifiedTargets.length ? unifiedTargets.map((target) => {
                    const targetName = targetMetadata[target.kind]?.[target.id]?.name || target.id;
                    const status = target.staticResolved && target.homeAssistantResolved
                      ? t("Static + HA")
                      : target.homeAssistantResolved
                        ? t("HA only")
                        : t("Static only");
                    return (
                      <div className="target-card" key={`${t(target.kind)}:${target.id}`}>
                        <span className={`target-card__kind target-card__kind--${target.kind}`}>{t(target.kind)}</span>
                        <span className="target-card__identity">
                          <strong>{targetName}</strong>
                          {targetName !== target.id && <code>{target.id}</code>}
                        </span>
                        <small
                          className={`target-card__status target-card__status--${target.homeAssistantResolved ? "ha" : "static"}`}
                          title={target.homeAssistantResolved && !target.staticResolved
                            ? t("Resolved by Home Assistant but not found by the static HA Lens parser")
                            : target.staticResolved && !target.homeAssistantResolved
                              ? t("Found statically; Home Assistant did not return it from related/runtime target resolution")
                              : t("Found statically and resolved by Home Assistant")}
                        >
                          {status}
                        </small>
                      </div>
                    );
                  }) : <div className="empty-state">{t("No entity/device/area/floor/label targets found.")}</div>}
                </div>
              </>
            ) : tab === "diff" ? (
              <div className="diff-inspector">
                <div className="diff-header">
                  <div>
                    <h3>{t("Automation Diff")}</h3>
                    <p>{t("Baseline")}: {baselineResult.ok ? baselineResult.automation.alias : t("invalid baseline")}</p>
                  </div>
                  <button
                    className="ghost diff-baseline-button"
                    disabled={!result.ok}
                    onClick={() => {
                      setBaselineYaml(yaml);
                      setSelectedDiffNodeId(null);
                    }}
                    title={t("Use the current local YAML as the new comparison baseline")}
                  >
                    {t("Set current as baseline")}
                  </button>
                </div>
                <div className="section-intro">
                  {t("The loaded Home Assistant version is captured automatically as the baseline. Edit or paste YAML locally to compare it without writing anything back.")}
                </div>
                {!baselineResult.ok ? (
                  <div className="notice">Baseline YAML could not be parsed: {baselineResult.error}</div>
                ) : automationDiff ? (
                  <>
                    <div className="diff-stat-grid">
                      <div className="diff-stat diff-stat--added"><strong>{automationDiff.stats.added}</strong><span>{t("Added")}</span></div>
                      <div className="diff-stat diff-stat--changed"><strong>{automationDiff.stats.changed}</strong><span>{t("Changed")}</span></div>
                      <div className="diff-stat diff-stat--removed"><strong>{automationDiff.stats.removed}</strong><span>{t("Removed")}</span></div>
                      <div className="diff-stat"><strong>{automationDiff.stats.unchanged}</strong><span>{t("Unchanged")}</span></div>
                    </div>
                    {automationDiff.hasChanges ? (
                      <div className="diff-change-list">
                        {automationDiff.changes.map((change) => {
                          const selected = Boolean(change.graphNodeId && selectedDiffNodeId === change.graphNodeId);
                          return (
                            <button
                              key={change.key}
                              className={`diff-change diff-change--${change.status} ${selected ? "is-active" : ""}`}
                              disabled={!change.graphNodeId}
                              onClick={() => {
                                if (!change.graphNodeId) return;
                                setSelectedDiffNodeId(selected ? null : change.graphNodeId);
                              }}
                            >
                              <span className={`diff-change__status diff-change__status--${change.status}`}>{t(change.status[0].toUpperCase() + change.status.slice(1))}</span>
                              <span className="diff-change__body">
                                <strong>{localizeNarrative(change.label, language)}</strong>
                                <small>{t(change.kind)}{change.detail ? ` · ${localizeNarrative(change.detail, language)}` : ""}</small>
                                {change.beforeLabel && change.afterLabel && change.beforeLabel !== change.afterLabel && (
                                  <span className="diff-change__transition">
                                    <span>{localizeNarrative(change.beforeLabel, language)}</span>
                                    <b>→</b>
                                    <span>{localizeNarrative(change.afterLabel, language)}</span>
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="diff-empty">
                        <strong>{t("No changes")}</strong>
                        <span>{t("The current YAML matches the captured baseline.")}</span>
                      </div>
                    )}
                    <p className="privacy">{t("Diffing happens entirely in your browser. Removed baseline nodes are shown only in the Diff graph and are never written to Home Assistant.")}</p>
                  </>
                ) : null}
              </div>
            ) : tab === "trace" && inspectorTrace ? (
              <div className="trace-inspector">
                {inspectorTraceIsDiagnostic && (
                  <div className="notice notice--warning">
                    <strong>{t("Trigger diagnostic — automation did not run.")}</strong> {t("Home Assistant recorded a trigger evaluation, but no automation execution started. These events are never used for Last run coverage.")}
                  </div>
                )}
                <div className="trace-overview">
                  <div><span>{t("Started")}</span><strong>{formatTraceTime(inspectorTrace.startedAt, language)}</strong></div>
                  <div><span>{t("Finished")}</span><strong>{inspectorTrace.finishedAt ? formatTraceTime(inspectorTrace.finishedAt, language) : t("still running / unknown")}</strong></div>
                  <div><span>{t("Result")}</span><strong>{inspectorTrace.scriptExecution || inspectorTrace.state || t("recorded")}</strong></div>
                  <div><span>{t("Last step")}</span><strong>{inspectorTrace.lastStep || t("unknown")}</strong></div>
                </div>
                {inspectorTrace.error && <div className="trace-card__error">{inspectorTrace.error}</div>}
                <div className="trace-toolbar">
                  <span>{inspectorTrace.steps?.length ?? inspectorTrace.paths.length} {t("runtime events")}</span>
                  {trace && (
                    <button
                      className="ghost trace-clear"
                      onClick={() => {
                        setSelectedTraceNodeId(null);
                        setShowTrace(true);
                      }}
                    >
                      {t("Show full run")}
                    </button>
                  )}
                </div>
                <div className="trace-step-list">
                  {(inspectorTrace.steps?.length
                    ? inspectorTrace.steps
                    : inspectorTrace.paths.map((path): CompanionTraceStep => ({ path }))
                  ).map((step, index) => {
                    const nodeId = tracePathToNodeId(step.path, result.graph.nodes.map((node) => node.id));
                    const node = nodeId ? graphNodeById.get(nodeId) : undefined;
                    const semanticId = tracePathToSemanticId(step.path, traceSemanticLabels.keys());
                    const semanticLabel = semanticId ? traceSemanticLabels.get(semanticId) : undefined;
                    const resultText = formatTraceResult(step.result, language);
                    const traceContext = buildTraceBreadcrumb(result.automation, step.path, step.repeatIndex);
                    const stepDetail = [
                      step.error || resultText,
                      step.repeatIndex ? `${t("iteration")} ${step.repeatIndex}` : null,
                    ].filter(Boolean).join(" · ");
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
                          if (!inspectorTraceIsDiagnostic) setShowTrace(true);
                        }}
                      >
                        <span className="trace-step__number">{index + 1}</span>
                        <span className="trace-step__body">
                          <strong>{localizeNarrative(semanticLabel || node?.label || step.path, language)}</strong>
                          {traceContext.length > 0 && (
                            <span className="trace-step__context" title={traceContext.join(" → ")}>
                              {traceContext.map((part, contextIndex) => (
                                <span key={`${part}-${contextIndex}`}>
                                  {contextIndex > 0 && <i aria-hidden="true">→</i>}
                                  <b>{localizeNarrative(part, language)}</b>
                                </span>
                              ))}
                            </span>
                          )}
                          <code>{step.path}</code>
                          {stepDetail && (
                            <small className={step.error ? "trace-step__error" : ""}>
                              {stepDetail}
                            </small>
                          )}
                          {step.targets && Object.entries(step.targets).some(([, ids]) => ids?.length) && (
                            <span className="trace-step__targets">
                              {Object.entries(step.targets).flatMap(([kind, ids]) => (ids ?? []).map((id) => {
                                const semanticKind = kind.replace("_id", "");
                                const targetName = targetMetadata[semanticKind]?.[id]?.name || id;
                                return (
                                  <small key={`${kind}:${id}`} title={targetName !== id ? id : undefined}>
                                    <b>{t(semanticKind)}</b>{targetName}
                                  </small>
                                );
                              }))}
                            </span>
                          )}
                        </span>
                        <span className="trace-step__time">{step.timestamp ? new Date(step.timestamp).toLocaleTimeString(language) : t(nodeId ? "mapped" : "unmapped")}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="privacy">{t("Trace data comes from Home Assistant's local trace API. Trigger diagnostics are kept separate from actual execution coverage. HA Lens does not execute the automation.")}</p>
              </div>
            ) : tab === "insights" ? (
              <>
                <div className="section-intro">{t("These are structural observations, not validation errors.")}</div>
                {result.analysis.insights.length ? result.analysis.insights.map((insight, index) => <div className={`insight insight--${insight.level}`} key={`${insight.nodeId}-${index}`}>{localizeNarrative(insight.message, language)}</div>) : <div className="empty-state">{t("No structural insights for this automation.")}</div>}
              </>
            ) : tab === "lint" ? (
              <div className="lint-panel">
                <div className="section-intro">{t("Optional static checks. Lint findings are advisory HA Lens observations, not Home Assistant validation errors.")}</div>
                {!lintEnabled ? (
                  <div className="lint-opt-in">
                    <strong>{t("Lint checks are off")}</strong>
                    <span>{t("Run conservative structural checks only when you want them.")}</span>
                    <button onClick={() => setLintEnabled(true)}>{t("Run lint checks")}</button>
                  </div>
                ) : (
                  <>
                    <div className="lint-toolbar">
                      <span>{lintIssues.length} {t("findings")}</span>
                      <button className="ghost" onClick={() => setLintEnabled(false)}>{t("Clear lint results")}</button>
                    </div>
                    {lintIssues.length ? (
                      <div className="lint-list">
                        {lintIssues.map((issue, index) => (
                          <div className={`lint-issue lint-issue--${issue.severity}`} key={`${issue.ruleId}-${issue.nodeId || index}`}>
                            <span className="lint-issue__id">{issue.ruleId}</span>
                            <span className="lint-issue__body">
                              <strong>{localizeNarrative(issue.title, language)}</strong>
                              <small>{localizeNarrative(issue.detail, language)}</small>
                            </span>
                            <span className="lint-issue__severity">{t(issue.severity)}</span>
                          </div>
                        ))}
                      </div>
                    ) : <div className="diff-empty"><strong>{t("No lint findings")}</strong><span>{t("None of the enabled HA Lens advisory rules matched this automation.")}</span></div>}
                    <p className="privacy">{t("Lint runs locally and does not replace Home Assistant configuration validation.")}</p>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="section-intro">{t("A deterministic explanation generated from the parsed automation structure. No AI or cloud processing is used.")}</div>
                <div className="explanation-list">
                  {result.explanation.map((line, index) => <p key={index}><span>{index + 1}</span>{localizeNarrative(line, language)}</p>)}
                </div>
              </>
            )}
          </div>
        </aside>
      </section>

      <footer className={`statusbar ${result.ok ? "statusbar--ok" : "statusbar--error"}`}>
        {result.ok ? `${t("Parsed successfully")} · ${result.analysis.entities.length} ${t("entities")} · ${result.paths.length} ${t("execution paths")} · ${result.analysis.stats.decisionPoints} ${t("decision points")}` : result.error}
      </footer>
    </main>
  );
}
