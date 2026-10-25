# HA Lens localization

## Supported interface languages

| Language | Code | Home Assistant regional examples |
| --- | --- | --- |
| English | `en` | `en-US`, `en-GB` |
| Deutsch | `de` | `de-DE`, `de-AT` |
| Español | `es` | `es-ES`, `es-MX` |
| Português | `pt` | `pt-PT`, `pt-BR` |
| Türkçe | `tr` | `tr-TR` |
| Polski | `pl` | `pl-PL` |
| Русский | `ru` | `ru-RU` |

HA Lens uses `hass.locale.language` from the signed-in Home Assistant user, not the server's language, browser language when embedded, or the automation's author. If the preferred language changes while the panel is open, the companion sends the normalized language to the sandboxed viewer over the existing nonce-checked messaging path; the current local YAML and Diff baseline remain intact. A standalone web viewer uses the browser language initially and offers a manual language selector. Unsupported languages fall back to English.

## What is translated

- HA Lens interface: toolbar, tabs, buttons, labels, status text, metadata, warnings and help text.
- Known HA Lens-generated lint, structure, explanation and path descriptions, using complete meaning-preserving messages and templates rather than replacing individual words in arbitrary user text.
- Home Assistant integration configuration-flow prompts under `custom_components/ha_lens/translations/`.

The following are **not** translated: Home Assistant and HA Lens product names; YAML keys such as `entity_id`, `trigger` and `action`; Entity IDs, service names, automation aliases, user notes, templates, trace paths, raw runtime results, and arbitrary strings coming from Home Assistant or other integrations. This protects semantics and makes troubleshooting reproducible.

## Source of truth

The shared offline catalogue is `custom_components/ha_lens/frontend/i18n.json`; both the React viewer and Home Assistant panel use the same file. The viewer imports it using `apps/web/src/i18n.ts`; the companion fetches it from its local `/ha_lens_static/i18n.json` route. No translation service, remote API, or cloud connection is used.

Every catalogue row has seven strings, ordered `en`, `de`, `es`, `pt`, `tr`, `pl`, `ru`. To add a user-facing message, add a meaningful translation for every language, reference the English source key via `translate` (or `localizeNarrative` for known generated content), and run `npm run check`. Keep CSS classes, protocol values, YAML and internal identifiers in English; use translations only for displayed copy. For complex language-dependent morphology, create explicit complete message templates with named placeholders instead of mechanically concatenating translated word fragments.

## Verification

`tests/localization.test.ts` checks locale normalization, full catalogue coverage, technical strings, generated-message patterns, HA config-flow translations, and stable CSS status identifiers. CI also validates all translation JSON. The automated Home Assistant contract suite covers 2026.9.4, 2026.10.0b7 and 2026.10.1.

**Browser verification for v0.1.38-beta.3:** The Home Assistant-served standalone viewer was tested in Chrome across all seven languages. A locally modified YAML example and its Diff counts remained unchanged through the switches. The HTML document language now follows the selected language; the narrow YAML-toolbar overflow was reproduced at 390px and the corrected build was verified at exactly 390px.\n\n**Still pending:** full end-to-end checks of the authenticated Home Assistant companion (including automatic locale propagation, real traces, HACS installation/restart, long text and mobile layouts in the embedded panel). Standalone-browser checks are not proof of those scenarios.
