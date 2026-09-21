# Graph Report - dp  (2026-09-22)

## Corpus Check
- 53 files · ~32,459 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 429 nodes · 608 edges · 36 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1b601cca`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]

## God Nodes (most connected - your core abstractions)
1. `h()` - 21 edges
2. `discord-purge Implementation Plan` - 19 edges
3. `compilerOptions` - 17 edges
4. `7. UI / floating panel (Discord-native styling)` - 16 edges
5. `scripts` - 14 edges
6. `mountPanel()` - 14 edges
7. `discord-purge — design spec` - 14 edges
8. `Logger` - 11 edges
9. `6. Discord API and deletion flow` - 11 edges
10. `8. Build, packaging, distribution` - 10 edges

## Surprising Connections (you probably didn't know these)
- `parseBoundary()` --calls--> `dateToSnowflake()`  [EXTRACTED]
  src/content/runner/filters.ts → src/content/api/snowflake.ts
- `parseBoundary()` --calls--> `isLikelySnowflake()`  [EXTRACTED]
  src/content/runner/filters.ts → src/content/api/snowflake.ts
- `messageFromElement()` --calls--> `isLikelySnowflake()`  [EXTRACTED]
  src/content/ui/picker.ts → src/content/api/snowflake.ts
- `start()` --calls--> `runPurge()`  [EXTRACTED]
  src/content/index.ts → src/content/runner/runner.ts
- `setupPanel()` --calls--> `mountPanel()`  [EXTRACTED]
  src/content/index.ts → src/content/ui/panel.ts

## Import Cycles
- None detected.

## Communities (36 total, 0 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (36): createApiClient(), getAuth(), listeners, onAuth(), api, applyLocation(), applyVisibility(), BgEnvelope (+28 more)

### Community 1 - "Community 1"
Cohesion: 0.10
Nodes (29): renderBoundary(), HeaderApi, iconBtn(), renderHeader(), LogBoxApi, renderLogBox(), PrimaryButtonApi, PrimaryButtonState (+21 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (42): 10. Manual verification checklist, 11. Risks & mitigations, 12. README disclaimer wording, 13. Glossary, 1. Summary, 2. Goals, 3. Non-goals (v1), 4. Architecture (+34 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (31): args, baseDefines, buildExtension(), buildUserscript(), clean(), commonExtensionOptions, copyAsset(), copyIcons() (+23 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (29): allowScripts, esbuild@0.28.0, @parcel/watcher@2.5.6, sharp@0.34.5, description, devDependencies, archiver, esbuild (+21 more)

### Community 5 - "Community 5"
Cohesion: 0.15
Nodes (21): ApiClient, CreateClientArgs, ApiResult, DiscordChannel, DiscordMessage, DiscordRecipient, DiscordUser, TargetApi (+13 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (20): Auth capture, Boundary semantics, Cancellation, Cross-browser, Manual QA checklist, Rate limiting & errors, Setup, UI (+12 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, esModuleInterop, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.18
Nodes (12): dateToSnowflake(), isLikelySnowflake(), snowflakeToMs(), BoundaryApi, BoundaryDeps, fmtPicked(), Mode, messageFromElement() (+4 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (14): scripts, build, build:chrome, build:firefox, build:userscript, dev, icons, lint (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.15
Nodes (12): 1. Correction, 2. Warning, 3. Temporary Ban, 4. Permanent Ban, Attribution, Contributor Covenant Code of Conduct, Enforcement, Enforcement Guidelines (+4 more)

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (11): 6.10 Persistence, 6.1 Endpoints used (only these three), 6.2 Channel ID source, 6.3 Boundary unification, 6.4 Per-message filter (always applied), 6.5 Main loop, 6.6 `deleteOne` — delay, retry, error mapping, 6.7 Outbound headers (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.20
Nodes (10): discord-purge Implementation Plan, File structure, Parallelization plan, Phase D — Auth-capture bridge, Phase M — Tampermonkey build, Phase N — Packaging scripts, Task 11: MAIN-world auth sniffer, Task 12: ISOLATED-world auth receiver and bus (+2 more)

### Community 13 - "Community 13"
Cohesion: 0.25
Nodes (7): arrowParens, endOfLine, printWidth, semi, singleQuote, tabWidth, trailingComma

### Community 14 - "Community 14"
Cohesion: 0.29
Nodes (7): main(), OUT, rasterize(), ROOT, SIZES, SRC, SRC_MONO

### Community 15 - "Community 15"
Cohesion: 0.29
Nodes (7): Phase A — Bootstrap, Task 1: Package metadata, Node version pin, editor config, Task 2: TypeScript & Prettier config, Task 3: ESLint flat config, Task 4: GPL-3.0-only LICENSE and README skeleton, Task 5: Shared constants, Task 6: Shared types and message contracts

### Community 16 - "Community 16"
Cohesion: 0.29
Nodes (7): Phase I — UI components, Task 27: Section + header components, Task 28: Target component, Task 29: Boundary picker, Task 30: Stats row, Task 31: Log box widget, Task 32: Primary button (Start / Cancel state)

### Community 17 - "Community 17"
Cohesion: 0.33
Nodes (6): Phase H — UI foundation, Task 22: `h()` helper, Task 23: Discord-token SCSS (theme variables + base), Task 24: Theme observer, Task 25: SPA navigation handler, Task 26: Drag-to-move

### Community 18 - "Community 18"
Cohesion: 0.33
Nodes (5): compilerOptions, lib, types, extends, include

### Community 19 - "Community 19"
Cohesion: 0.40
Nodes (3): Architecture, Conventions, Verification gate

### Community 20 - "Community 20"
Cohesion: 0.40
Nodes (5): Phase F — Runner (scheduler / filters / loop), Task 16: Scheduler, Task 17: Filters and boundary parsing, Task 18: Logger (ring-buffered), Task 19: Runner main loop

### Community 21 - "Community 21"
Cohesion: 0.50
Nodes (4): Phase E — Discord API client, Task 13: Snowflake helpers, Task 14: Discord API types, Task 15: API client

### Community 22 - "Community 22"
Cohesion: 0.50
Nodes (4): Phase J — Panel assembly + state machine, Task 33: Panel composition, Task 34: Content-script entry: wire everything together, Task 35: First end-to-end smoke test on a low-stakes DM

### Community 23 - "Community 23"
Cohesion: 0.50
Nodes (4): Phase O — CI / CD, Task 42: PR + push CI, Task 43: Tag-push release packaging, Task 44: AMO + Chrome Web Store auto-publish (wired-but-disabled)

### Community 24 - "Community 24"
Cohesion: 0.67
Nodes (3): Phase B — Build pipeline, Task 7: Version stamping helper, Task 8: esbuild orchestrator

### Community 25 - "Community 25"
Cohesion: 0.67
Nodes (3): Phase C — Skeleton extension that loads in Chrome, Task 10: Minimal placeholder source files so the build runs, Task 9: Chrome MV3 manifest

### Community 26 - "Community 26"
Cohesion: 0.67
Nodes (3): Phase G — Background SW + popup, Task 20: Background service worker (storage broker only), Task 21: Popup (open-DM helper)

### Community 27 - "Community 27"
Cohesion: 0.67
Nodes (3): Phase K — Iconography, Task 36: Source SVGs, Task 37: Icon raster generator

### Community 28 - "Community 28"
Cohesion: 0.67
Nodes (3): Phase L — Firefox build, Task 38: Firefox manifest, Task 39: Firefox legacy fallback (no `world:MAIN`)

### Community 29 - "Community 29"
Cohesion: 0.67
Nodes (3): Phase P — Documentation, Task 45: Manual QA checklist, Task 46: Expanded README

## Knowledge Gaps
- **254 isolated node(s):** `semi`, `singleQuote`, `trailingComma`, `printWidth`, `tabWidth` (+249 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `discord-purge Implementation Plan` connect `Community 12` to `Community 6`, `Community 15`, `Community 16`, `Community 17`, `Community 20`, `Community 21`, `Community 22`, `Community 23`, `Community 24`, `Community 25`, `Community 26`, `Community 27`, `Community 28`, `Community 29`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Why does `discord-purge — design spec` connect `Community 2` to `Community 11`, `Community 6`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **What connects `semi`, `singleQuote`, `trailingComma` to the rest of the system?**
  _254 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07616892911010557 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.10220673635307782 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.047619047619047616 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.06612685560053981 - nodes in this community are weakly interconnected._