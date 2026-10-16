# HA Lens – Übergabe für den nächsten Chat

**Stand:** 16. Oktober 2026. Dieses Dokument ist ein bewusst öffentliches, datensparsames Projekt-Handoff für die Weiterentwicklung von **HA Lens**, nicht eine Aufzeichnung privater Home-Assistant-Daten. **Vor jeder neuen Arbeit den aktuellen `main`-Branch, die Releases und CI erneut prüfen**, weil dieser Stand fortschreiten kann.

## 1. Projekt, Release-Status und Links

- Repository: https://github.com/Manantra/ha-lens
- Branch: `main`; geprüfter Ausgangs-Commit: `54eb3b24279d158f39d5bfe5ba609b50704be3da`.
- **Neueste veröffentlichte Beta beim Erstellen:** `v0.1.38-beta.2` – https://github.com/Manantra/ha-lens/releases/tag/v0.1.38-beta.2
- **Neueste Stable beim Erstellen:** `v0.1.36` – https://github.com/Manantra/ha-lens/releases/tag/v0.1.36
- GitHub Actions für den oben genannten Beta-Commit: **CI, Home Assistant compatibility, Release HACS integration, Deploy web app to GitHub Pages erfolgreich**.
- Welche Beta beim Nutzer installiert ist, muss im neuen Chat erfragt oder direkt bestätigt werden. Ein GitHub-Release beweist **keine** Installation auf dem Home-Assistant-System.
- Noch **keine Stable-Freigabe** für die Mehrsprachigkeits-Beta: Browser-/Live-Tests stehen aus.

## 2. Produktauftrag und unumstößliche Regeln

HA Lens ist eine **schreibgeschützte Analyse- und Visualisierungsintegration** für bestehende Home-Assistant-Automationen. Es erstellt Graphen, Ausführungspfade, Entity-/Target-Übersichten, statische Hinweise, deterministische Erklärungen, Trace-Overlays, Diff-Vergleiche, lokale Snapshots und optionale Lint-Hinweise.

**Nie** Automationen aus HA Lens heraus ausführen, verändern oder in Home Assistant zurückschreiben. Änderungen im YAML-Eingabefeld und eine Diff-Baseline gelten ausschließlich lokal im Browser. Bei Live-Tests keine realen Home-Assistant-Automationen speichern oder verändern. In einem neuen Chat den Nutzer erst informieren, bevor eine tatsächliche Home-Assistant-Installation bzw. ein Live-Test vorgenommen wird.

**Übersetzungsregel:** **Niemals YAML-Code oder YAML-Logik übersetzen oder umschreiben.** Ebenso unverändert: `trigger`, `condition`, `action`, `entity_id`, Templates, IDs, Service-Namen, Entity-IDs, Benutzer-Aliase, Automationstitel, Kommentare, persönliche Beschreibungen, rohe Trace-Ergebnisse und die Produktnamen **Home Assistant** und **HA Lens**. Nur eigene verständliche UI-Texte sowie explizit als automatisch generiert bekannte Beschriftungen und Analyseerklärungen übersetzen. Keine automatische Einzelwort-Übersetzung fremder Daten.

## 3. Architektur und Quellcode

- `apps/web/src/App.tsx` – React-Oberfläche, Tabs, YAML, Trace/Diff, Sprachzustand.
- `apps/web/src/i18n.ts` – Sprach-Normalisierung, Übersetzungszugriff, semantische Sätze, Graph-Beschriftungen und sprachabhängige Mengenformen.
- `apps/web/src/AutomationGraph.tsx`, `LensNode.tsx`, `layout.ts`, `styles.css` – XYFlow/ELK-Graph und Darstellung.
- `apps/web/src/automationDiff.ts` – semantischer Vergleich einer lokalen YAML-Baseline.
- `apps/web/src/traceMapping.ts`, `lint.ts`, `snapshot.ts`, `companionPayload.ts`.
- `packages/model`, `parser`, `analyzer`, `paths`, `graph`, `exporter` – semantischer Kern, unabhängig von React.
- `custom_components/ha_lens/__init__.py` – Integration, Admin-Panel, gebündelter statischer Viewer.
- `custom_components/ha_lens/frontend/ha-lens-panel.js` – Parent-Panel, HA-Automationsauswahl und offizielle HA-WebSocket-Datenzugriffe.
- `custom_components/ha_lens/frontend/app/` – automatisch gebautes, lokal auszulieferndes Viewer-Bundle. **Nicht** mit handgeschriebenen Änderungen patchen.
- `custom_components/ha_lens/frontend/i18n.json` – gemeinsamer offline nutzbarer Sprachkatalog.
- `custom_components/ha_lens/translations/*.json` – HA-Integrationsdialoge.
- `custom_components/ha_lens/brand/icon.png` und `logo.png` – lokale HA-Branding-Assets.
- `custom_components/ha_lens/manifest.json` – **maßgebliche HACS-/Integrationsversion**, unabhängig von der `package.json`-Monorepo-Version.

## 4. Home-Assistant-Anbindung, Sicherheit und Funktionen

- Home Assistant listet `automation.*` über `hass.states`; die ausgewählte YAML-Konfiguration kommt über die offizielle WebSocket-Methode `automation/config`.
- Referenzen: `search/related` und lokale Entity-/Device-/Area-/Floor-/Label-Register; berücksichtigt Child-Device-Areas.
- Laufzeitdaten über `trace/list` / `trace/get`; tatsächliche Ausführungen und `not_triggered`-Diagnosen sind **getrennt**. Nur reale Ausführungen zählen für Execution Coverage.
- Graph versteht u. a. `if`, `choose`, Repeat, Parallel, Wait, Delay, Conditions, deaktivierte/dynamisch aktivierte Blöcke, verschachtelte Trigger-Listen, moderne HA-Ziele und noch unbekannte Syntax mit sichtbar markiertem Fallback.
- Trace-Graph: tatsächlich durchlaufene, nicht gewählte und nicht erreichte Zweige; Repeat-/Parallel-Coverage; Zielinformationen soweit verfügbar.
- Diff: Added/Changed/Removed/Unchanged und Baseline, Behandlung generierter `Triggered by`-IDs; keine HA-Schreibaktion.
- Sandbox-Viewer mit nonce-authentifiziertem MessageChannel, begrenzten/geprüften Payloads; der Viewer bekommt keinen HA-Zugriffstoken.
- Eigenes HACS-kompatibles Integration-Panel ist admin-only/read-only; gebündelter Viewer läuft lokal ohne GitHub Pages.
- Lokaler YAML-Snapshot enthält keine HA-Trace- oder Register-Metadaten.
- Dependency-Absicherung: versioniertes `package-lock.json`, `npm ci --ignore-scripts`, `npm audit`, SBOM, begrenzte GitHub-Workflow-Berechtigungen und getrennte Build-/Publish-Jobs.

Ausführliche Technikdokumente: [Architektur](architecture.md), [Companion](hacs-companion.md), [Support-Matrix](support-matrix.md), [Lokalisierung](localization.md), [Roadmap](../ROADMAP.md).

## 5. Mehrsprachigkeit – aktueller Implementierungsstand

Sieben Sprachen: **Englisch (`en`), Deutsch (`de`), Spanisch (`es`), Portugiesisch (`pt`), Türkisch (`tr`), Polnisch (`pl`) und Russisch (`ru`)**.

- Das Home-Assistant-Panel liest die Sprache des angemeldeten Nutzers über `hass.locale.language`. Regionale Varianten wie `de-DE` und `pt-BR` verwenden den Basissprachkatalog; unbekannte Sprachen fallen auf Englisch zurück.
- Bei einer HA-Oberflächensprachänderung kann das Panel die Sprache über den bestehenden nonce-geprüften Kanal an den isolierten Viewer weitergeben; lokales YAML und Diff-Baseline sollen erhalten bleiben.
- Standalone-Webviewer: anfangs Browsersprache, außerdem manuelle Sprachauswahl.
- Lokalisierte Elemente: Toolbar, Navigation, Tabs, Graph-Badges und explizit generierte Graph-Knoten/Edge-Beschriftungen, Diff/Trace/Lint, Erklärungen, Pfade, Meldungen und Einrichtungsdialoge.
- Neu in **v0.1.38-beta.2**: sprachabhängige Mengenformen (insbesondere für Polnisch/Russisch) und sichere Lokalisierung **nur generierter** Graph-Texte statt Benutzer-Aliasen.
- Wichtig: CSS-Klassen, interne Statuswerte und technische Protokollbezeichner dürfen **nicht** lokalisiert werden; Regressionstests sichern dies ab.
- Zentrale Quelle `custom_components/ha_lens/frontend/i18n.json`. Neue Keys müssen für **alle sieben Sprachen** sinnvoll übersetzt werden, möglichst mit vollständigen Satzmustern und Platzhaltern statt Wort-für-Wort-Fragmenten.
- YAML bleibt **in jeder Sprache byteinhaltlich unangetastet**; übersetzt wird ausschließlich dessen Präsentation und die HA-Lens-generierte Erklärung.

## 6. Was bereits automatisiert geprüft wurde

Bei `v0.1.38-beta.2` liefen GitHub Actions für **CI, HACS-Release, Home Assistant compatibility und Pages erfolgreich**.

Qualitätskommandos:

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
# oder:
npm run check
```

Testgruppen umfassen Parser/Kern, HA-2026-Kompatibilität, Trace Mapping, Automation Diff, Companion-Payload/-Panel, Snapshots, Lint und Übersetzungen. Home-Assistant-Vertragstests laufen für **2026.9.4**, **2026.10.0b7** und **2026.10.1**.

**Grenzen:** CI ist kein vollständiger echter Browser-/HACS-End-to-End-Test. Der locale-aware Wechsel bei geöffnetem Home Assistant, mobile/wenig breite Ansichten sowie echte Trace- und Diff-Szenarien müssen im nächsten gemeinsamen Live-Test geprüft werden.

## 7. Branding

- Das HA-Lens-Logo ist im README, in der Integrationskarte und in der HA-Lens-Kopfleiste eingebunden. Branding liegt unter `custom_components/ha_lens/brand/`; das Panel bezieht sein eigenes Icon lokal.
- Die HA-Seitenleiste verwendet konstruktionsbedingt weiterhin ein MDI-Symbol.
- **Bekannte externe HACS-Einschränkung:** In der HACS-Suche kann das Icon weiter als `?` bzw. `Icon not available` erscheinen, während es in Home Assistant korrekt sichtbar ist. Zuletzt erwähnte Upstream-Tickets: https://github.com/hacs/integration/issues/5402 und https://github.com/hacs/frontend/pull/937 . Aktuellen HACS-Status jeweils erneut prüfen; nicht als eigenen HA-Lens-Bug behandeln, solange die lokalen Assets funktionieren.

## 8. Noch offen / Prioritäten im nächsten Chat

1. **Vor jeder Änderung aktuelle GitHub-Lage prüfen:** Releases, `main`-SHA, offenen PRs/Issues, GitHub Actions, Roadmap.
2. **Nutzer fragen, welche Beta tatsächlich installiert ist.** Zuletzt veröffentlichte Beta beim Verfassen ist `0.1.38-beta.2`, nicht automatisch die installierte.
3. **Gemeinsamer Live-Test von v0.1.38-beta.2**, sobald der Nutzer es möchte: Installation/Neustart, Anzeige in HA-Lens, automatischer Sprachbezug und Wechsel im geöffneten Panel, alle sieben Sprachen, fehlerfreie lange Texte auf Desktop/Mobilgerät, Grammatik 1/2/5/11/22, Graph-Badges, Pfade, Explain, Lint, Diff, Trace, User-Aliase.
4. Bei Sprachwechsel **YAML unverändert** nachweisen, ebenso Entity-IDs, Templates und Kommentare. Änderungen am YAML nur lokal, ohne HA-Writes.
5. Kompatibilitätsszenarien in der Praxis: Triggerlisten/`Triggered by`-IDs, Purpose-specific Targets, disabled Blocks, Trace vs `not_triggered`, Repeat/Parallel, Diff Added/Changed/Removed samt Fokus und Baseline.
6. **Erst nach fehlerfreiem Live-Test** mögliche finale `v0.1.38` Stable planen und mit neuer CI-/Release-Prüfung veröffentlichen. Bei Bugs vorher neue Beta.
7. Offener Dependabot-PR beim Verfassen: **#12**, `@types/node` 24 → 26; nicht ohne Prüfung der Build-Node-Version (derzeit Node 22.12.0) übernehmen.
8. Monitoring neuer Home-Assistant-Stable/Beta-Versionen und der HACS-Branding-Issue.

## 9. Arbeitsweise und Release-Ablauf

- Nutzer bevorzugt praktische Umsetzung, transparente Tests und **Deutsch** für die Zusammenarbeit.
- Quellcode/Doku über GitHub-Connector prüfen und committen; Builds/Tests/GitHub Actions bis zum Abschluss kontrollieren. **Nicht** nur einen Plan formulieren, wenn konkrete Umsetzung erbeten wird.
- Für Frontend-Codeänderungen Companion-Bundle-Workflow abwarten: dieser aktualisiert das generierte `custom_components/ha_lens/frontend/app` in einem eigenen Bot-Commit. Der Sprachkatalog löst einen Rebuild ebenfalls aus.
- Erst dann `custom_components/ha_lens/manifest.json` auf neue **Beta-Version** setzen, HACS-Release sowie Typecheck/Tests/Build/HA-Kompatibilität auf dem **tatsächlichen Release-Commit** prüfen.
- Home-Assistant-Installation und Browser-Praxistests nur, wenn Nutzer sie tatsächlich ausführen bzw. autorisieren kann; keine erfundenen Live-Ergebnisse.
- Stable **nicht** allein aufgrund grüner Unit-/Contract-Tests veröffentlichen.
- Kein öffentliches GitHub-Dokument mit privaten LAN-Adressen, persönlichen Entity-IDs, Automation-YAML, Tokens, Passwortangaben oder Remote-Geräte-IDs füllen.

## 10. Einstiegsprompt für neuen Chat

> Bitte arbeite an **HA Lens**, GitHub **https://github.com/Manantra/ha-lens**. Lies zuerst diese Übergabe (`docs/NEXT_CHAT_HANDOFF.md`), `README.md`, `ROADMAP.md`, `docs/localization.md` und den aktuellen GitHub-Release-/CI-Stand. Neueste Beta beim Handoff: `0.1.38-beta.2`; Stable: `0.1.36`. HA Lens ist strikt read-only. Die Benutzeroberfläche unterstützt en/de/es/pt/tr/pl/ru passend zur Home-Assistant-Sprache. **YAML, Entity-IDs, Templates, Benutzer-Aliase und Produktnamen dürfen niemals übersetzt oder verändert werden.** Prüfe zuerst, welche Version inzwischen installiert ist, und arbeite dann die noch ausstehenden Live-Sprach-, Trace-, Diff- und Responsive-Tests durch, sofern ich den Zugriff dazu freigebe. Korrigiere konkrete Probleme zuerst in einer Beta, lasse CI/Bundling/HACS-Release durchlaufen und mache Stable erst nach erfolgreichem Praxistest. Bewahre alle bisherigen Features und Sicherheitsgrenzen.

---

*Dieses Dokument soll bei jeder größeren Entwicklungsrunde aktualisiert werden. GitHub ist die Quelle für Code, Versionen und veröffentlichte Releases; mündliche Statusmeldungen ersetzen die technische Prüfung nicht.*
