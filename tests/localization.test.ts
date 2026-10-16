import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import catalog from "../custom_components/ha_lens/frontend/i18n.json";
import { LANGUAGE_CODES, formatQuantity, localizeGeneratedEdgeLabel, localizeGeneratedGraphLabel, localizeGeneratedGraphSubtitle, normalizeLanguage, translate, translationKeys, localizeNarrative } from "../apps/web/src/i18n";
import { buildAutomationGraph } from "@ha-lens/graph";
import { parseAutomationYaml } from "@ha-lens/parser";

describe("HA Lens localization", () => {
  it("resolves Home Assistant UI locales and falls back safely", () => {
    expect(normalizeLanguage("de-DE")).toBe("de");
    expect(normalizeLanguage("pt_BR")).toBe("pt");
    expect(normalizeLanguage("es-ES")).toBe("es");
    expect(normalizeLanguage("tr-TR")).toBe("tr");
    expect(normalizeLanguage("pl-PL")).toBe("pl");
    expect(normalizeLanguage("ru-RU")).toBe("ru");
    expect(normalizeLanguage("en-US")).toBe("en");
    expect(normalizeLanguage("ja-JP")).toBe("en");
    expect(normalizeLanguage(null)).toBe("en");
  });

  it("provides all seven translations for every user-facing key", () => {
    expect(catalog.languages).toEqual([...LANGUAGE_CODES]);
    expect(new Set(translationKeys).size).toBe(translationKeys.length);
    expect(translationKeys.length).toBeGreaterThan(150);
    for (const row of catalog.rows) {
      expect(row).toHaveLength(LANGUAGE_CODES.length);
      for (const [index, language] of LANGUAGE_CODES.entries()) {
        expect(typeof row[index]).toBe("string");
        expect(row[index].trim().length).toBeGreaterThan(0);
        expect(translate(row[0], language)).toBe(row[index]);
      }
    }
  });

  it("preserves technical identifiers, user labels and product names", () => {
    for (const language of LANGUAGE_CODES) {
      expect(translate("Home Assistant", language)).toBe("Home Assistant");
      expect(translate("light.living_room", language)).toBe("light.living_room");
      expect(translate("target.entity_id", language)).toBe("target.entity_id");
      expect(translate("YAML", language)).toBe("YAML");
    }
    expect(translate("Summary", "de")).toBe("Übersicht");
    expect(translate("Paths", "es")).toBe("Recorridos");
  });

  it("translates generated explanations and lint findings without rewriting technical values", () => {
    expect(localizeNarrative("Starts when binary_sensor.motion turns on.", "de"))
      .toBe("Startet, wenn binary_sensor.motion turns on.");
    expect(localizeNarrative("Stops at light.turn_off", "es"))
      .toBe("Se detiene en light.turn_off");
    expect(localizeNarrative("Completes: light.turn_on", "pt"))
      .toBe("Conclui em: light.turn_on");
    expect(localizeNarrative("No automatic triggers", "pl")).toBe("Brak automatycznych wyzwalaczy");
    expect(localizeNarrative("This wait has no timeout and may pause indefinitely.", "ru"))
      .toBe("У ожидания нет ограничения по времени, поэтому оно может длиться бесконечно.");
    expect(localizeNarrative("3 trigger/condition blocks are shown generically because HA Lens does not recognize a more specific type.", "tr"))
      .toContain("3 tetikleyici/koşul bloğu");
    expect(localizeNarrative("Custom automation name", "de")).toBe("Custom automation name");
    expect(localizeNarrative("target.entity_id", "de")).toBe("target.entity_id");
  });

  it("uses natural quantity forms in English, German, Turkish, Polish and Russian", () => {
    expect(formatQuantity(1, "entities", "en")).toBe("1 entity");
    expect(formatQuantity(5, "entities", "en")).toBe("5 entities");
    expect(formatQuantity(1, "entities", "de")).toBe("1 Entität");
    expect(formatQuantity(5, "entities", "de")).toBe("5 Entitäten");
    expect(formatQuantity(4, "execution paths", "tr")).toBe("4 çalışma yolu");
    expect(formatQuantity(3, "decision points", "tr")).toBe("3 karar noktası");
    expect(formatQuantity(1, "execution paths", "ru")).toBe("1 путь выполнения");
    expect(formatQuantity(4, "execution paths", "ru")).toBe("4 пути выполнения");
    expect(formatQuantity(5, "execution paths", "ru")).toBe("5 путей выполнения");
    expect(formatQuantity(3, "decision points", "ru")).toBe("3 точки принятия решений");
    expect(formatQuantity(5, "entities", "pl")).toBe("5 encji");
    expect(formatQuantity(22, "entities", "pl")).toBe("22 encje");
  });

  it("translates generated graph labels, subtitles, and edges while preserving raw values", () => {
    for (const language of LANGUAGE_CODES) {
      expect(localizeGeneratedGraphLabel("light.living_room", language)).toBe("light.living_room");
      expect(localizeGeneratedGraphSubtitle("Note: Condition failed · light.living_room", language))
        .toContain("Condition failed · light.living_room");
    }
    expect(localizeGeneratedGraphLabel("Condition failed", "de")).toBe("Bedingung nicht erfüllt");
    expect(localizeGeneratedGraphLabel("If / then / else", "de")).toBe("Wenn / dann / sonst");
    expect(localizeGeneratedGraphLabel("Choose (2 options)", "es")).toBe("Elegir (2 opciones)");
    expect(localizeGeneratedGraphLabel("Delay 00:00:02", "ru")).toBe("Задержка 00:00:02");
    expect(localizeGeneratedGraphSubtitle("First matching option wins · Note: Continue · entity_id", "de"))
      .toBe("Die erste passende Option wird ausgeführt · Hinweis: Continue · entity_id");
    expect(localizeGeneratedEdgeLabel("Option 3", "pl")).toBe("Opcja 3");
    expect(localizeGeneratedEdgeLabel("branch 2", "tr")).toBe("dal 2");
    expect(localizeGeneratedEdgeLabel("true", "de")).toBe("wahr");
  });

  it("marks only generated graph labels as translatable, not user-authored aliases", () => {
    const yaml = [
      "alias: Graph locale test",
      "triggers:",
      "  - trigger: state",
      "    entity_id: binary_sensor.motion",
      "actions:",
      "  - choose:",
      "      - alias: Continue",
      "        conditions:",
      "          - condition: state",
      "            entity_id: input_boolean.mode",
      "            state: 'on'",
      "        sequence:",
      "          - alias: Completed",
      "            action: light.turn_on",
      "            target:",
      "              entity_id: light.living_room",
      "      - conditions:",
      "          - condition: template",
      "            value_template: '{{ true }}'",
      "        sequence:",
      "          - delay: '00:00:01'",
    ].join("\n");
    const { automation } = parseAutomationYaml(yaml);
    const graph = buildAutomationGraph(automation);
    expect(graph.nodes.find((n) => n.label === "Completed")?.generatedLabel).toBe(false);
    expect(graph.edges.find((e) => e.label === "Continue")?.generatedLabel).toBe(false);
    expect(graph.edges.find((e) => e.label === "Option 2")?.generatedLabel).toBe(true);
    expect(graph.nodes.find((n) => n.label === "Continue" && n.kind === "merge")?.generatedLabel).toBe(true);
    expect(graph.nodes.find((n) => n.label === "Delay 00:00:01")?.generatedLabel).toBe(true);
  });

  it("keeps CSS status identifiers stable in every locale", () => {
    const app = readFileSync("apps/web/src/App.tsx", "utf8");
    expect(app).toContain("diff-change--${change.status}");
    expect(app).toContain("diff-change__status--${change.status}");
    expect(app).toContain("lint-issue--${issue.severity}");
    expect(app).toContain("target-card__kind--${target.kind}");
    expect(app).toContain('aria-label={t("Graph view mode")}');
    expect(app).toContain('language={language}');
  });

  it("has localized configuration flow entries for every supported language", () => {
    for (const language of LANGUAGE_CODES) {
      const file = readFileSync(`custom_components/ha_lens/translations/${language}.json`, "utf8");
      const messages = JSON.parse(file);
      expect(messages.title).toBe("HA Lens");
      expect(messages.config.step.user.title).toContain("HA Lens");
      expect(messages.config.step.user.description).toContain("Home Assistant");
      expect(messages.config.abort.single_instance_allowed.length).toBeGreaterThan(20);
    }
    expect(JSON.parse(readFileSync("custom_components/ha_lens/translations/pt-BR.json", "utf8")).title).toBe("HA Lens");
  });

  it("covers every literal localization key used by the UI and companion", () => {
    const sources = [
      ["apps/web/src/App.tsx", /\\bt\\(["']([^"'\\x60]+)["']\\)/g],
      ["apps/web/src/LensNode.tsx", /\\bt\\(["']([^"'\\x60]+)["']\\)/g],
      ["custom_components/ha_lens/frontend/ha-lens-panel.js", /\\._t\\(["']([^"'\\x60]+)["']\\)/g],
    ] as const;
    const dictionary = new Set(translationKeys);
    for (const [path, pattern] of sources) {
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(pattern)) {
        expect(dictionary.has(match[1]), `${path}: missing localization key "${match[1]}"`).toBe(true);
      }
    }
  });

  it("loads the panel catalog from the local Home Assistant route", () => {
    const panel = readFileSync("custom_components/ha_lens/frontend/ha-lens-panel.js", "utf8");
    expect(panel).toContain('this._hass?.locale?.language');
    expect(panel).toContain('/ha_lens_static/i18n.json');
    expect(panel).toContain('url.searchParams.set("lang"');
    expect(panel).toContain("language: this._language");
    expect(panel).toContain('type: "ha-lens:locale"');
  });
});
