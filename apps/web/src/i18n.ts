import catalog from "../../../custom_components/ha_lens/frontend/i18n.json";

/** User-facing labels only. YAML keys, entity IDs, user aliases, and raw trace data are not translated. */
export const LANGUAGE_CODES = ["en", "de", "es", "pt", "tr", "pl", "ru"] as const;
export type Language = (typeof LANGUAGE_CODES)[number];
export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English", de: "Deutsch", es: "Español", pt: "Português",
  tr: "Türkçe", pl: "Polski", ru: "Русский",
};

export function normalizeLanguage(input: unknown): Language {
  if (typeof input !== "string") return "en";
  const code = input.trim().toLowerCase().replace(/_/g, "-").split("-")[0];
  return LANGUAGE_CODES.includes(code as Language) ? code as Language : "en";
}

const dictionary: Record<Language, Record<string, string>> = {
  en: {}, de: {}, es: {}, pt: {}, tr: {}, pl: {}, ru: {},
};
for (const row of catalog.rows) {
  LANGUAGE_CODES.forEach((language, index) => {
    dictionary[language][row[0]] = row[index];
  });
}
export const translationKeys = catalog.rows.map((row) => row[0]);
export function translate(
  key: string,
  language: Language,
  vars?: Record<string, string | number>,
): string {
  const value = dictionary[language]?.[key] ?? key;
  return vars
    ? value.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match)
    : value;
}
export function localizeKind(kind: string, language: Language): string {
  return translate(kind, language);
}
