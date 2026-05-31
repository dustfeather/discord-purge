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

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
