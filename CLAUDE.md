# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — esbuild watch, Chrome target only; load `dist/chrome` unpacked.
- `npm run lint` — ESLint (`--max-warnings=0`) **plus** `tsc --noEmit`. This is the only verification gate; there is no test suite. Manual checklist: `docs/manual-qa.md`.

Node >= 24. Other scripts (`build*`, `pack*`, `icons`) are in `package.json`.

## Architecture

One TypeScript codebase builds three targets — Chrome MV3, Firefox MV3, Tampermonkey userscript — via `scripts/build.ts` (esbuild).

- Target differences resolve at **build time** through compile-time defines: `__TARGET__`, `__USERSCRIPT__`, `__FIREFOX_LEGACY__`, `__VERSION__`. Branch on these, not on runtime checks.
- `.scss` imports are compiled and inlined as JS string exports by a custom esbuild plugin — no CSS files ship.
- Version comes from git tags via `scripts/version.ts`; manifests are templated from `manifest/manifest.*.json`.

Three execution contexts, do not confuse them:
- `src/injected/auth-sniffer.ts` runs in the page's **MAIN world** — monkey-patches `fetch`/XHR to capture Discord auth headers and emits them as a DOM `CustomEvent`. Self-guarded against double-injection. Extension mode loads it via manifest; userscript and `--firefox-legacy` modes inject it from the content script instead.
- `src/content/` is the **ISOLATED-world** content script (entry `index.ts`) — API client, UI panel, delete runner.
- `src/background/service-worker.ts` is a message broker only — persists state to `chrome.storage.local`, toggles panel visibility.

Cross-context messages are typed in `src/shared/messages.ts`; keep both message-union and handler in sync. Deletion timing / retry / back-off live in `RUN_CONFIG` in `src/shared/constants.ts`.

UI uses a hyperscript helper (`src/content/ui/h.ts`) — no framework.

## Conventions

- Cross-context imports use `.js` extensions on TypeScript sources (ESM resolution).
- `eslint-plugin-security` is enabled; suppress genuine false positives with an inline `eslint-disable-next-line` that states the reason.
