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

/** Known patterns are immutable and shared across renders. */
const NARRATIVE_PATTERNS: Array<[RegExp, string, string[]]> = [
    [/^Starts when (.+)\.$/, "Starts when {detail}.", ["detail"]],
    [/^(\d+) configured triggers? (?:is|are) disabled in Home Assistant\.$/, "{count} configured triggers are disabled in Home Assistant.", ["count"]],
    [/^(\d+) configured triggers? (?:uses|use) templated enabled state and can start the automation only when Home Assistant evaluates the template as true\.$/, "{count} configured triggers use templated enabled state and can start the automation only when Home Assistant evaluates the template as true.", ["count"]],
    [/^Before actions run, every enabled top-level condition must pass: (.+)\.$/, "Before actions run, every enabled top-level condition must pass: {detail}.", ["detail"]],
    [/^(.+) is disabled in Home Assistant and is skipped during execution\.$/, "{item} is disabled in Home Assistant and is skipped during execution.", ["item"]],
    [/^(.+) uses templated enabled state; Home Assistant may skip this step at runtime\.$/, "{item} uses templated enabled state; Home Assistant may skip this step at runtime.", ["item"]],
    [/^Then it calls (.+)\.$/, "Then it calls {item}.", ["item"]],
    [/^Then it runs the (.+) device action in the (.+) domain\.$/, "Then it runs the {item} device action in the {domain} domain.", ["item", "domain"]],
    [/^Decision: (.+)\. If true: (.+)\. If false: (.+)\.$/, "Decision: {condition}. If true: {yes}. If false: {no}.", ["condition", "yes", "no"]],
    [/^Choose checks (\d+) options? in order and runs the first match, otherwise it uses the default branch\.$/, "Choose checks {count} options in order and runs the first match, otherwise it uses the default branch.", ["count"]],
    [/^Choose checks (\d+) options? in order and runs the first match\.$/, "Choose checks {count} options in order and runs the first match.", ["count"]],
    [/^(.+) repeats a nested sequence; HA Lens keeps the loop symbolic because the actual iteration count can depend on runtime state\.$/, "{item} repeats a nested sequence; HA Lens keeps the loop symbolic because the actual iteration count can depend on runtime state.", ["item"]],
    [/^(.+) starts (\d+) branches concurrently\.$/, "{item} starts {count} branches concurrently.", ["item", "count"]],
    [/^(.+) runs its nested steps in order: (.+)\.$/, "{item} runs its nested steps in order: {steps}.", ["item", "steps"]],
    [/^(.+) fires a Home Assistant event\.$/, "{item} fires a Home Assistant event.", ["item"]],
    [/^(.+) updates the conversation response\.$/, "{item} updates the conversation response.", ["item"]],
    [/^(.+) with timeout (.+)\.$/, "{item} with timeout {timeout}.", ["item", "timeout"]],
    [/^(.+) without a timeout\.$/, "{item} without a timeout.", ["item"]],
    [/^(.+) ends execution at that point\.$/, "{item} ends execution at that point.", ["item"]],
    [/^(.+) must pass or execution stops immediately\.$/, "{item} must pass or execution stops immediately.", ["item"]],
    [/^(.+) is part of the action sequence\.$/, "{item} is part of the action sequence.", ["item"]],
    [/^Editor note: (.+)$/, "Editor note: {note}", ["note"]],
    [/^Response data is stored in variable (.+)\.$/, "Response data is stored in variable {variable}.", ["variable"]],

    [/^“(.+)” and later siblings cannot be reached when this stop executes\.$/, "“{item}” and later siblings cannot be reached when this stop executes.", ["item"]],
    [/^(\d+) blocks? (?:uses|use) templated or otherwise dynamic enabled state\. HA Lens cannot know statically whether (?:it runs|they run)\.$/, "{count} blocks use a dynamic enabled state; HA Lens cannot determine statically whether they run.", ["count"]],
    [/^(\d+) triggers share “(.+)”\. Home Assistant 2026\.10 still supports shared manual IDs, but its editor may offer to assign unique IDs when a Triggered by condition references them\.$/, "{count} triggers share “{id}”. Home Assistant 2026.10 still supports shared manual IDs, but its editor may offer to assign unique IDs when a Triggered by condition references them.", ["count", "id"]],
    [/^This condition references (.+), but no current trigger uses that ID\. Home Assistant 2026\.10 flags the same dangling reference in the automation editor\.$/, "This condition references {ids}, but no current trigger uses that ID. Home Assistant 2026.10 flags the same dangling reference in the automation editor.", ["ids"]],
    [/^Home Assistant 2026\.10 rejects a state condition that combines “for” with (.+)\. Remove “for” or use a single literal state\.$/, "Home Assistant 2026.10 rejects a state condition that combines “for” with {reason}. Remove “for” or use a single literal state.", ["reason"]],
    [/^(\d+) actions? (?:is|are) preserved as unknown\. Home Assistant may support the syntax even though HA Lens cannot model its behavior yet\.$/, "{count} actions are preserved as unknown. Home Assistant may support the syntax even though HA Lens cannot model its behavior yet.", ["count"]],
    [/^(\d+) trigger\/condition blocks? (?:is|are) shown generically because HA Lens does not recognize a more specific type\.$/, "{count} trigger/condition blocks are shown generically because HA Lens does not recognize a more specific type.", ["count"]],
    [/^Path (\d+)$/, "Path {index}", ["index"]],
    [/^Stops at (.+)$/, "Stops at {item}", ["item"]],
    [/^Completes: (.+)$/, "Completes: {item}", ["item"]],
];

/** Localize only known HA Lens-generated prose patterns; never rewrite user-supplied YAML, aliases or IDs. */
export function localizeNarrative(text: string, language: Language): string {
  const exact = translate(text, language);
  if (exact !== text || language === "en") return exact;

  for (const [pattern, key, fields] of NARRATIVE_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const vars: Record<string, string> = {};
    fields.forEach((name, index) => { vars[name] = name === "reason" ? translate(match[index + 1], language) : match[index + 1]; });
    return translate(key, language, vars);
  }

  const suffix = text.match(/^(.*) → (true|false|default|no match|skipped|completed|timeout)$/);
  if (suffix) return suffix[1] + " → " + translate(suffix[2], language);
  return text;
}

/** Human-facing quantities use locale-specific noun forms instead of English-style plural suffixes. */
export type QuantityKind = "entities" | "execution paths" | "decision points";
type Forms = readonly [string, string, string, string]; // one, few, many, other
const QUANTITIES: Record<Language, Record<QuantityKind, Forms>> = {
  en: {
    entities: ["entity", "entities", "entities", "entities"],
    "execution paths": ["execution path", "execution paths", "execution paths", "execution paths"],
    "decision points": ["decision point", "decision points", "decision points", "decision points"],
  },
  de: {
    entities: ["Entität", "Entitäten", "Entitäten", "Entitäten"],
    "execution paths": ["Ausführungspfad", "Ausführungspfade", "Ausführungspfade", "Ausführungspfade"],
    "decision points": ["Entscheidungspunkt", "Entscheidungspunkte", "Entscheidungspunkte", "Entscheidungspunkte"],
  },
  es: {
    entities: ["entidad", "entidades", "entidades", "entidades"],
    "execution paths": ["recorrido de ejecución", "recorridos de ejecución", "recorridos de ejecución", "recorridos de ejecución"],
    "decision points": ["punto de decisión", "puntos de decisión", "puntos de decisión", "puntos de decisión"],
  },
  pt: {
    entities: ["entidade", "entidades", "entidades", "entidades"],
    "execution paths": ["percurso de execução", "percursos de execução", "percursos de execução", "percursos de execução"],
    "decision points": ["ponto de decisão", "pontos de decisão", "pontos de decisão", "pontos de decisão"],
  },
  tr: {
    entities: ["varlık", "varlık", "varlık", "varlık"],
    "execution paths": ["çalışma yolu", "çalışma yolu", "çalışma yolu", "çalışma yolu"],
    "decision points": ["karar noktası", "karar noktası", "karar noktası", "karar noktası"],
  },
  pl: {
    entities: ["encja", "encje", "encji", "encji"],
    "execution paths": ["ścieżka wykonania", "ścieżki wykonania", "ścieżek wykonania", "ścieżki wykonania"],
    "decision points": ["punkt decyzyjny", "punkty decyzyjne", "punktów decyzyjnych", "punktu decyzyjnego"],
  },
  ru: {
    entities: ["сущность", "сущности", "сущностей", "сущности"],
    "execution paths": ["путь выполнения", "пути выполнения", "путей выполнения", "пути выполнения"],
    "decision points": ["точка принятия решений", "точки принятия решений", "точек принятия решений", "точки принятия решений"],
  },
};
const pluralRules = Object.fromEntries(
  LANGUAGE_CODES.map((language) => [language, new Intl.PluralRules(language)]),
) as Record<Language, Intl.PluralRules>;

export function formatQuantity(value: number, kind: QuantityKind, language: Language): string {
  const category = pluralRules[language].select(value);
  const index = category === "one" ? 0 : category === "few" ? 1 : category === "many" ? 2 : 3;
  return String(value) + " " + QUANTITIES[language][kind][index];
}

/** Only apply this to graph nodes explicitly identified as HA Lens-generated text. */
export function localizeGeneratedGraphLabel(text: string, language: Language): string {
  if (language === "en") return text;
  const exact = translate(text, language);
  if (exact !== text) return exact;

  const wait = text.match(/^(Wait for template|Wait for trigger)(.*)$/);
  if (wait) return translate(wait[1], language) + wait[2]
    .replace(/\btimeout\b/g, translate("timeout", language))
    .replace(/stop on timeout/g, translate("Stop on timeout", language));
  const patterns: readonly [RegExp, string, string][] = [
    [/^Choose \((\d+) option\)$/, "Choose ({count} option)", "count"],
    [/^Choose \((\d+) options\)$/, "Choose ({count} options)", "count"],
    [/^Parallel \((\d+) branch\)$/, "Parallel ({count} branch)", "count"],
    [/^Parallel \((\d+) branches\)$/, "Parallel ({count} branches)", "count"],
    [/^Sequence \((\d+) step\)$/, "Sequence ({count} step)", "count"],
    [/^Sequence \((\d+) steps\)$/, "Sequence ({count} steps)", "count"],
    [/^Delay (.+)$/, "Delay {value}", "value"],
    [/^Fire event: (.+)$/, "Fire event: {value}", "value"],
    [/^Stop: (.+)$/, "Stop: {value}", "value"],
    [/^Activate scene → (.+)$/, "Activate scene → {value}", "value"],
  ];
  for (const [pattern, key, name] of patterns) {
    const match = text.match(pattern);
    if (match) return translate(key, language, { [name]: match[1] });
  }
  return text;
}

/** Render known system metadata while preserving any user-authored note verbatim. */
export function localizeGeneratedGraphSubtitle(subtitle: string, language: Language): string {
  if (language === "en") return subtitle;
  // Keep the complete user note untouched, including delimiters or words identical to UI labels.
  const noteStart = subtitle.indexOf(" · Note: ");
  const noteOnly = subtitle.startsWith("Note: ");
  const systemSubtitle = noteOnly ? "" : noteStart >= 0 ? subtitle.slice(0, noteStart) : subtitle;
  const noteSuffix = noteOnly ? subtitle.slice(6) : noteStart >= 0 ? subtitle.slice(noteStart + " · Note: ".length) : null;
  const translatedSystem = systemSubtitle.split(" · ").map((part) => {
    const exact = translate(part, language);
    if (exact !== part) return exact;
    if (part.startsWith("Device action · ")) {
      return translate("Device action", language) + part.slice("Device action".length);
    }
    if (part.startsWith("Response → ")) {
      return translate("Response", language) + part.slice("Response".length);
    }
    return part;
  }).join(" · ");
  return noteSuffix === null ? translatedSystem
    : (translatedSystem ? translatedSystem + " · " : "") + translate("Note", language) + ": " + noteSuffix;
}

/** This is only for edges marked as generated. User-supplied branch aliases are not localized. */
export function localizeGeneratedEdgeLabel(label: string, language: Language): string {
  if (language === "en") return label;
  const exact = translate(label, language);
  if (exact !== label) return exact;
  const match = label.match(/^(branch|Option) (\d+)$/);
  if (match) return translate(match[1] === "branch" ? "branch {index}" : "Option {index}", language, { index: match[2] });
  return label;
}
