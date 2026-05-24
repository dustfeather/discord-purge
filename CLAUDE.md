# CLAUDE.md

## Verification gate

- `npm run lint` = ESLint (`--max-warnings=0`) PLUS `tsc --noEmit`. Only verification gate; no tests. Manual checklist: `docs/manual-qa.md`.
- Node >= 24.

## Architecture

One TS codebase → three targets (Chrome MV3, Firefox MV3, Tampermonkey userscript) via `scripts/build.ts` (esbuild).

- Target differences resolve at **build time** via compile-time defines: `__TARGET__`, `__USERSCRIPT__`, `__FIREFOX_LEGACY__`, `__VERSION__`. Branch on these, NOT runtime checks.
- `.scss` imports compiled + inlined as JS string exports by custom esbuild plugin — no CSS files ship.
- Version from git tags via `scripts/version.ts`; manifests templated from `manifest/manifest.*.json`.

Three execution contexts — do NOT confuse:
- `src/injected/auth-sniffer.ts` runs in page's **MAIN world** — monkey-patches `fetch`/XHR to capture Discord auth headers, emits via DOM `CustomEvent`. Self-guarded against double-injection. Extension mode loads via manifest; userscript + `--firefox-legacy` inject from content script instead.
- `src/content/` = **ISOLATED-world** content script (entry `index.ts`) — API client, UI panel, delete runner.
- `src/background/service-worker.ts` = message broker only — persists state to `chrome.storage.local`, toggles panel visibility.

Cross-context messages typed in `src/shared/messages.ts`; keep message-union + handler in sync. Deletion timing/retry/back-off in `RUN_CONFIG` in `src/shared/constants.ts`. UI uses hyperscript helper (`src/content/ui/h.ts`) — no framework.

## Conventions

- Cross-context imports use `.js` extensions on TS sources (ESM resolution).
- `eslint-plugin-security` enabled; suppress genuine false positives with inline `eslint-disable-next-line` stating reason.
