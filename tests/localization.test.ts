import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import catalog from "../custom_components/ha_lens/frontend/i18n.json";
import { LANGUAGE_CODES, normalizeLanguage, translate, translationKeys, localizeNarrative } from "../apps/web/src/i18n";

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

  it("loads the panel catalog from the local Home Assistant route", () => {
    const panel = readFileSync("custom_components/ha_lens/frontend/ha-lens-panel.js", "utf8");
    expect(panel).toContain('this._hass?.locale?.language');
    expect(panel).toContain('/ha_lens_static/i18n.json');
    expect(panel).toContain('url.searchParams.set("lang"');
    expect(panel).toContain("language: this._language");
    expect(panel).toContain('type: "ha-lens:locale"');
  });
});
