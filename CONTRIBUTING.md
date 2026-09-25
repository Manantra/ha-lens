# Contributing to HA Lens

Thanks for helping make Home Assistant automations easier to understand.

## Local development

```bash
npm install
npm run dev
```

Before opening a pull request, run:

```bash
npm run check
```

## Parser contributions

When adding support for Home Assistant syntax:

1. Keep the semantic model renderer-independent.
2. Preserve unsupported syntax as an `unknown` node rather than throwing.
3. Add or update a YAML fixture.
4. Add a regression test for parsing, analysis, paths, or graph output.
5. Avoid claiming runtime behavior that cannot be known statically, especially for templates.

## Product principles

- Read-only first.
- Never execute pasted automation YAML.
- Prefer factual structural observations over subjective lint rules.
- Keep client-side analysis private by default.
