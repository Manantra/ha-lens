# Security policy

HA Lens is designed as a read-only automation analyzer. The standalone app must not require Home Assistant credentials, and the Home Assistant companion must not register write/execute actions for automations.

## Current security model

- The Home Assistant panel is admin-only.
- Only the selected automation configuration is fetched through Home Assistant's official read API.
- The bundled viewer runs in a sandboxed iframe and does not receive a Home Assistant access token.
- The opaque-origin viewer loads only bundled files from a dedicated CORS-enabled static endpoint; that route contains no Home Assistant state, trace data, registry data, or credentials.
- Parent/child messages use a random per-panel nonce and source validation.
- Trace/reference payloads are compacted, allow-listed, and bounded before the viewer uses them.
- Parser nesting and execution-path expansion have explicit safety limits.
- npm dependencies are installed reproducibly from `package-lock.json`; CI runs a dependency audit and emits a CycloneDX SBOM.
- Build workflows are read-only; repository write permission is isolated to artifact publish/release jobs, and GitHub Actions are pinned to immutable commit SHAs.
- A compatibility workflow checks the official Home Assistant WebSocket contracts HA Lens depends on against pinned Stable and Beta versions.

## Reporting a vulnerability

Please do not report security vulnerabilities in a public issue. Use GitHub's private vulnerability reporting for this repository when available.

Do not include real secrets, access tokens, webhook URLs, passwords, private URLs, or other credentials in bug reports, traces, screenshots, or fixtures.
