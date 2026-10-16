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

/** Localize only known HA Lens-generated prose patterns; never rewrite user-supplied YAML, aliases or IDs. */
export function localizeNarrative(text: string, language: Language): string {
  const exact = translate(text, language);
  if (exact !== text || language === "en") return exact;

  const patterns: Array<[RegExp, string, string[]]> = [
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
  for (const [pattern, key, fields] of patterns) {
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
