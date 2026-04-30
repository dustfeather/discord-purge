# discord-purge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `discord-purge` — a Chrome MV3 + Firefox MV3 extension and Tampermonkey userscript that bulk-unsends the user's own messages from Discord 1:1 and group DMs (under `https://discord.com/channels/@me/*`).

**Architecture:** A MAIN-world content script sniffs the `Authorization` header from Discord's outbound API requests and forwards it via `CustomEvent` to an ISOLATED-world content script, which renders a Discord-native floating panel (Shadow DOM) and runs a serial DELETE loop with jittered spacing and 429 backoff. A background service worker only handles `chrome.storage` persistence — it never calls Discord. Tampermonkey collapses everything into a single MAIN-world userscript.

**Tech Stack:** TypeScript 5.x, esbuild, SCSS (sass), `sharp` (icon raster export), `archiver` (zip/xpi packaging), Node 22+, npm. No UI framework; vanilla TS with a tiny `h()` helper.

**Spec:** `docs/superpowers/specs/2026-05-01-discord-purge-design.md`. This plan implements §1–§13 of that spec.

**Testing approach:** Per spec §10 and explicit user direction, *no automated tests*. Every task ends with `npm run lint` (eslint + `tsc --noEmit`) and `npm run build` as the automated quality gate. Browser smoke checks are called out at the end of each major phase.

**Branching & commits:** Work directly on `main`. One commit per task. Conventional Commits style (`feat:`, `chore:`, `build:`, `ci:`, `docs:`, `style:`).

---

## File structure

Files this plan creates (organized by phase):

```
discord-purge/
├── .editorconfig
├── .gitignore
├── .nvmrc
├── .prettierrc.json
├── eslint.config.mjs
├── LICENSE                                       # GPL-3.0-only
├── package.json
├── README.md
├── tsconfig.json
├── tsconfig.scripts.json
├── docs/
│   ├── manual-qa.md                              # spec §10 as a runnable checklist
│   └── superpowers/
│       ├── specs/2026-05-01-discord-purge-design.md  # already exists
│       └── plans/2026-05-01-discord-purge.md          # this file
├── manifest/
│   ├── manifest.chrome.json
│   └── manifest.firefox.json
├── assets/icons/
│   ├── source.svg
│   └── source-mono.svg
├── scripts/
│   ├── build.ts                                  # esbuild orchestrator (chrome|firefox|userscript)
│   ├── pack-zip.ts                               # zips dist/chrome -> dist/chrome.zip
│   ├── pack-xpi.ts                               # zips dist/firefox -> dist/firefox.xpi
│   ├── pack-userscript.ts                        # bundles single-file userscript
│   ├── gen-icons.ts                              # SVG -> PNG/ICO via sharp
│   └── version.ts                                # tag-derived version string
├── src/
│   ├── shared/
│   │   ├── constants.ts                          # API_VERSION, DISCORD_EPOCH, defaults
│   │   ├── types.ts                              # cross-context shared types
│   │   └── messages.ts                           # content<->bg message types
│   ├── injected/
│   │   └── auth-sniffer.ts                       # MAIN world
│   ├── content/
│   │   ├── index.ts                              # ISOLATED entry point
│   │   ├── auth.ts                               # AuthHeaders state + bus
│   │   ├── api/
│   │   │   ├── client.ts                         # fetch wrapper using captured headers
│   │   │   ├── types.ts                          # Discord types we use
│   │   │   └── snowflake.ts                      # date <-> snowflake helpers
│   │   ├── runner/
│   │   │   ├── runner.ts                         # purge() main loop
│   │   │   ├── scheduler.ts                      # jitteredSleep, backoff, retry-after
│   │   │   └── filters.ts                        # candidate(), boundary parsing
│   │   ├── log/
│   │   │   └── log.ts                            # ring-buffered Logger
│   │   └── ui/
│   │       ├── panel.ts                          # mount + state machine + layout
│   │       ├── h.ts                              # tiny createElement helper
│   │       ├── theme.ts                          # MutationObserver -> data-theme
│   │       ├── nav.ts                            # SPA-nav + locationchange event
│   │       ├── drag.ts                           # drag-to-move + persisted position
│   │       ├── styles.scss
│   │       └── components/
│   │           ├── header.ts
│   │           ├── section.ts                    # generic <section><h3 class="label">…
│   │           ├── target.ts                     # channel info
│   │           ├── boundary.ts                   # segmented control + inputs
│   │           ├── stats.ts
│   │           ├── log.ts                        # log-box widget (renders Logger output)
│   │           └── primaryBtn.ts
│   ├── background/
│   │   └── service-worker.ts                     # storage broker
│   └── popup/
│       ├── popup.html
│       ├── popup.ts
│       └── popup.scss
└── .github/workflows/
    ├── ci.yml                                    # lint + typecheck + build (PR + push)
    ├── release.yml                               # tag-push: build, pack, GitHub Release
    ├── publish-amo.yml                           # wired-but-disabled
    └── publish-cws.yml                           # wired-but-disabled
```

---

## Parallelization plan

Many tasks touch disjoint files and have no source-level dependencies on each other. They can be authored concurrently by parallel subagents, then reviewed and committed in waves. The waves below group tasks that can run in parallel; later waves wait for earlier waves to land.

> **Orchestrator note:** Use `superpowers:subagent-driven-development`. Dispatch N agents in parallel for each wave (N = wave size), wait for all commits to land, briefly review, then advance to the next wave. Where a wave has a single task it is unblocked-but-essential (a join point). Where a wave is a manual gate (👤), do not dispatch agents — stop and let the human operate the browser.

| Wave | Parallelism | Tasks | Why grouped |
|---|---|---|---|
| **W0** | 1 | T1 | Installs `node_modules`. Everything else needs it. |
| **W1** | 6 | T2, T3, T4, T9, T36, T45 | Configs, LICENSE/README, Chrome manifest, SVGs, QA doc — all touch different files, no source deps. |
| **W2** | 3 | T5, T6, T7 | Shared types/constants/version helper — small, independent files. |
| **W3** | 6 | T8, T10, T22, T23, T24, T26 | Build orchestrator + skeleton sources + UI primitives with zero source deps (`h`, SCSS, theme watcher, drag). |
| **W4** | 10 | T11, T12, T13, T14, T16, T18, T25, T37, T38, T41 | Auth sniffer + receiver, snowflake, API types, scheduler, logger, nav listener, icon raster generator, Firefox manifest, packers. All touch separate files. |
| **W5** | 7 | T15, T17, T20, T21, T27, T30, T32 | API client (needs 13/14), filters (needs 13/14), background SW, popup, header/section, stats, primary button. |
| **W6** | 4 | T19, T28, T29, T31 | Runner (needs 15/16/17/18), target (needs 14/15/22), boundary (needs 13/22), log component (needs 18/22). |
| **W7** | 1 | T33 | Panel assembly — depends on every UI component. |
| **W8** | 1 | T34 | Content-script entry — wires every subsystem; mandatory single-threaded merge point. |
| **W9** 👤 | 0 | T35 | Manual smoke against a real DM. Human only. |
| **W10** | 2 | T39, T40 | Firefox legacy fallback + Tampermonkey build. Both touch `src/content/index.ts` — author together to avoid merge conflicts; conflict-free if assigned to one agent or two coordinating agents. **If running in parallel, dispatch them sequentially or merge their diffs in a single agent's session.** |
| **W11** | 3 | T42, T43, T44 | CI/CD workflow files — entirely separate YAML files. |
| **W12** | 1 | T46 | README final pass. |
| **W13** 👤 | 0 | T47 | Final clean build + manual QA + tag push. Human only. |

**Notes for parallel execution:**

1. **Per-task isolation:** every task in a wave creates or modifies non-overlapping files (with the noted W10 caveat). Confirm by checking the `**Files:**` block of each task — if two parallel tasks list the same file under "Modify", they cannot run in true parallel and must serialize.
2. **Per-task commits:** each subagent commits its own task at the end of its run. Do not batch commits; reviewability collapses if multiple unrelated tasks live in one commit.
3. **Lint discipline:** `npm run lint` is part of every task's gates. The orchestrator may run `npm run lint` once after each wave lands as an extra safety net.
4. **Conflict on `src/content/index.ts`:** modified by T10, T12, T34, T39, T40. The plan orders these so each modification happens in a different wave (W3, W4, W8, W10) — never two parallel agents touching it simultaneously. Within W10, prefer single-agent execution.
5. **Conflict on `scripts/build.ts`:** created in T8 (W3), modified in T21 (W5) and T39 (W10). Same single-wave-only rule applies.

If a wave has more tasks than your runner can dispatch in parallel, split the wave by alphabetical task number — the dependency rules are pairwise, so any subset is safe.

---

## Phase A — Bootstrap

### Task 1: Package metadata, Node version pin, editor config

**Files:**
- Create: `package.json`
- Create: `.nvmrc`
- Create: `.editorconfig`
- Create: `.gitignore`

- [ ] **Step 1.1: Create `.nvmrc`**

```
22
```

- [ ] **Step 1.2: Create `.editorconfig`**

```
root = true

[*]
charset = utf-8
end_of_line = lf
indent_size = 2
indent_style = space
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 1.3: Create `.gitignore`**

```
node_modules/
dist/
*.log
.DS_Store
.env
.env.*
!.env.example
coverage/
```

- [ ] **Step 1.4: Create `package.json`**

```json
{
  "name": "discord-purge",
  "version": "0.0.0",
  "private": true,
  "description": "Bulk-unsend your own messages from Discord DMs.",
  "license": "GPL-3.0-only",
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "tsx scripts/build.ts --target=chrome --watch",
    "build:chrome": "tsx scripts/build.ts --target=chrome",
    "build:firefox": "tsx scripts/build.ts --target=firefox",
    "build:userscript": "tsx scripts/build.ts --target=userscript",
    "build": "npm run build:chrome && npm run build:firefox && npm run build:userscript",
    "pack:chrome": "tsx scripts/pack-zip.ts",
    "pack:firefox": "tsx scripts/pack-xpi.ts",
    "pack:userscript": "tsx scripts/pack-userscript.ts",
    "pack": "npm run build && npm run pack:chrome && npm run pack:firefox && npm run pack:userscript",
    "icons": "tsx scripts/gen-icons.ts",
    "lint": "eslint . --max-warnings=0 && tsc --noEmit",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.270",
    "@types/firefox-webext-browser": "^120.0.4",
    "@types/node": "^22.7.0",
    "@typescript-eslint/eslint-plugin": "^8.8.0",
    "@typescript-eslint/parser": "^8.8.0",
    "archiver": "^7.0.1",
    "@types/archiver": "^6.0.2",
    "esbuild": "^0.24.0",
    "eslint": "^9.11.0",
    "eslint-plugin-security": "^3.0.1",
    "globals": "^15.9.0",
    "prettier": "^3.3.3",
    "sass": "^1.79.0",
    "sharp": "^0.33.5",
    "tsx": "^4.19.1",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 1.5: Install**

Run: `npm install`
Expected: completes without errors; `node_modules/` and `package-lock.json` appear.

- [ ] **Step 1.6: Commit**

```bash
git add .nvmrc .editorconfig .gitignore package.json package-lock.json
git commit -m "chore: bootstrap package metadata and editor config"
```

---

### Task 2: TypeScript & Prettier config

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.scripts.json`
- Create: `.prettierrc.json`

- [ ] **Step 2.1: Create `tsconfig.json` (extension code)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "noEmit": true,
    "types": ["chrome", "node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2.2: Create `tsconfig.scripts.json` (build scripts)**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["scripts/**/*.ts"]
}
```

- [ ] **Step 2.3: Create `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [ ] **Step 2.4: Verify typecheck runs cleanly**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors (the project has no `.ts` files yet, this just validates the config file itself parses).

- [ ] **Step 2.5: Commit**

```bash
git add tsconfig.json tsconfig.scripts.json .prettierrc.json
git commit -m "chore: add TypeScript and Prettier configuration"
```

---

### Task 3: ESLint flat config

**Files:**
- Create: `eslint.config.mjs`

- [ ] **Step 3.1: Create `eslint.config.mjs`**

```js
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import security from 'eslint-plugin-security';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '*.user.js', 'docs/**'],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      globals: { ...globals.browser, chrome: 'readonly' },
    },
    plugins: { '@typescript-eslint': tseslint, security },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...security.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['scripts/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      globals: { ...globals.node },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-console': 'off',
    },
  },
];
```

- [ ] **Step 3.2: Verify lint runs (no source files yet; should pass trivially)**

Run: `npm run lint`
Expected: passes with no output (or just `tsc` returning 0).

- [ ] **Step 3.3: Commit**

```bash
git add eslint.config.mjs
git commit -m "chore: add ESLint flat config (typescript + security)"
```

---

### Task 4: GPL-3.0-only LICENSE and README skeleton

**Files:**
- Create: `LICENSE`
- Create: `README.md`

- [ ] **Step 4.1: Create `LICENSE` — paste the full GPL-3.0-only text**

Source: https://www.gnu.org/licenses/gpl-3.0.txt — copy verbatim. (Do not paraphrase.)

The file must start with:

```
                    GNU GENERAL PUBLIC LICENSE
                       Version 3, 29 June 2007
```

…and contain the complete unmodified text through the appendix "How to Apply These Terms to Your New Programs."

- [ ] **Step 4.2: Create `README.md` skeleton**

```markdown
# discord-purge

Bulk-unsend your own messages from Discord 1:1 and group direct-message threads, from a floating panel that visually blends with Discord's own UI.

## What it does

- Walks the currently-open DM under `https://discord.com/channels/@me/<id>` from newest message backwards.
- Deletes every message you authored that matches your filter.
- Single optional **boundary** filter: delete only messages older than a chosen datetime, *or* older than a chosen message ID.
- Pinned messages are never touched.
- Discord rate limits (HTTP 429) are handled automatically with backoff.

## Install

- **Chrome / Edge:** download `chrome.zip` from the latest release, unzip, then load it in `chrome://extensions` with "Developer mode" enabled and "Load unpacked".
- **Firefox:** download `firefox.xpi` and install via `about:debugging` → "Load Temporary Add-on…", or use the AMO listing if available.
- **Tampermonkey:** install `discord-purge.user.js` directly from the latest release.

## Use at your own risk

> Bulk-deleting messages can violate Discord's Terms of Service. The author of this project is not responsible for any account actions taken against you. Review Discord's Terms before use.

## License

GPL-3.0-only. See [LICENSE](./LICENSE).
```

- [ ] **Step 4.3: Commit**

```bash
git add LICENSE README.md
git commit -m "docs: add GPL-3.0-only LICENSE and README skeleton"
```

---

### Task 5: Shared constants

**Files:**
- Create: `src/shared/constants.ts`

- [ ] **Step 5.1: Create `src/shared/constants.ts`**

```ts
export const API_BASE = 'https://discord.com/api';
export const API_VERSION = 'v9';
export const API_ROOT = `${API_BASE}/${API_VERSION}`;

export const DISCORD_EPOCH = 1420070400000n; // 2015-01-01T00:00:00Z

export const ROUTE_DM_PATH_PREFIX = '/channels/@me/';
export const ROUTE_DM_REGEX = /^\/channels\/@me\/(\d{15,25})(?:\/.*)?$/;

export const RUN_CONFIG = {
  baseDelayMs: 3500,
  jitterRatio: 0.3,
  maxAttempts: 5,
  minRetryAfterMs: 5000,
  backoffCapMs: 30000,
} as const;

export const STORAGE_KEYS = {
  panelPosition: 'panel.position',
  panelCollapsed: 'panel.collapsed',
  log: 'log.lines',
  stats: 'stats.lastRun',
} as const;

export const EVENT_AUTH = 'discord-purge:auth';
export const EVENT_LOCATION = 'discord-purge:locationchange';

export const RELEVANT_AUTH_HEADERS = [
  'authorization',
  'x-super-properties',
  'x-discord-locale',
  'x-discord-timezone',
  'x-debug-options',
] as const;

export type RelevantAuthHeader = (typeof RELEVANT_AUTH_HEADERS)[number];
```

- [ ] **Step 5.2: `npm run lint` to confirm typecheck passes**

Run: `npm run lint`
Expected: passes.

- [ ] **Step 5.3: Commit**

```bash
git add src/shared/constants.ts
git commit -m "feat(shared): add API/route/run-config constants"
```

---

### Task 6: Shared types and message contracts

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/messages.ts`

- [ ] **Step 6.1: Create `src/shared/types.ts`**

```ts
import type { RelevantAuthHeader } from './constants.js';

export type AuthHeaders = Partial<Record<RelevantAuthHeader, string>>;

export type RunStats = {
  scanned: number;
  deleted: number;
  skipped: number;        // pinned / non-default type
  alreadyGone: number;    // 404
  forbidden: number;      // 403
  errors: number;
};

export type LogLine = {
  ts: number;             // epoch ms
  msg: string;
};

export type Boundary =
  | { kind: 'none' }
  | { kind: 'datetime'; iso: string }   // local-iso from <input type="datetime-local">
  | { kind: 'messageId'; id: string };  // 18-20 digits

export type PanelState =
  | 'loading-auth'
  | 'ready'
  | 'running'
  | 'cancelling'
  | 'done'
  | 'error';
```

- [ ] **Step 6.2: Create `src/shared/messages.ts`**

```ts
import type { LogLine, RunStats } from './types.js';

export type ContentToBg =
  | { kind: 'log:append'; line: LogLine }
  | { kind: 'log:read' }
  | { kind: 'log:clear' }
  | { kind: 'stats:save'; stats: RunStats }
  | { kind: 'stats:read' }
  | { kind: 'panel:setPosition'; x: number; y: number }
  | { kind: 'panel:getPosition' }
  | { kind: 'panel:setCollapsed'; collapsed: boolean }
  | { kind: 'panel:getCollapsed' };

export type BgResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

export type BgToPopup =
  | { kind: 'popup:openDm' };
```

- [ ] **Step 6.3: Lint**

Run: `npm run lint`
Expected: passes.

- [ ] **Step 6.4: Commit**

```bash
git add src/shared/types.ts src/shared/messages.ts
git commit -m "feat(shared): define cross-context types and message contracts"
```

---

## Phase B — Build pipeline

### Task 7: Version stamping helper

**Files:**
- Create: `scripts/version.ts`

- [ ] **Step 7.1: Create `scripts/version.ts`**

```ts
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Resolve the build version, in order of preference:
 *   1. GITHUB_REF_NAME with leading "v" stripped (CI tag-push).
 *   2. Latest annotated git tag minus the leading "v".
 *   3. package.json version.
 *   4. "0.0.0".
 */
export function resolveVersion(): string {
  const ref = process.env['GITHUB_REF_NAME'];
  if (ref && /^v\d/.test(ref)) return ref.replace(/^v/, '');

  try {
    const tag = execSync('git describe --tags --abbrev=0', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (/^v\d/.test(tag)) return tag.replace(/^v/, '');
  } catch {
    // ignore
  }

  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    if (typeof pkg.version === 'string' && pkg.version) return pkg.version;
  } catch {
    // ignore
  }

  return '0.0.0';
}
```

- [ ] **Step 7.2: Manually verify**

Run: `node --import tsx --eval "import('./scripts/version.ts').then(m => console.log(m.resolveVersion()))"`
Expected: prints `0.0.0` (no git tag yet, package version is `0.0.0`).

- [ ] **Step 7.3: Commit**

```bash
git add scripts/version.ts
git commit -m "build: add version resolver (CI tag, git describe, package.json)"
```

---

### Task 8: esbuild orchestrator

**Files:**
- Create: `scripts/build.ts`

- [ ] **Step 8.1: Create `scripts/build.ts`**

```ts
import { build, context, type BuildOptions, type Plugin } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as sass from 'sass';
import { resolveVersion } from './version.ts';

type Target = 'chrome' | 'firefox' | 'userscript';

const args = process.argv.slice(2);
const target = (args.find((a) => a.startsWith('--target='))?.split('=')[1] ?? 'chrome') as Target;
const watch = args.includes('--watch');
const firefoxLegacy = args.includes('--firefox-legacy');

const ROOT = resolve(import.meta.dirname, '..');
const SRC = resolve(ROOT, 'src');
const DIST = resolve(ROOT, 'dist', target);
const VERSION = resolveVersion();

if (!['chrome', 'firefox', 'userscript'].includes(target)) {
  console.error(`Unknown target: ${target}`);
  process.exit(1);
}

const sassInlinePlugin: Plugin = {
  name: 'sass-inline',
  setup(b) {
    b.onResolve({ filter: /\.scss(\?inline)?$/ }, (a) => ({
      path: resolve(a.resolveDir, a.path.replace('?inline', '')),
      namespace: 'sass-inline',
    }));
    b.onLoad({ filter: /.*/, namespace: 'sass-inline' }, async (a) => {
      const result = sass.compile(a.path, { style: 'compressed' });
      return {
        contents: `export default ${JSON.stringify(result.css)};`,
        loader: 'js',
        watchFiles: result.loadedUrls.map((u) => u.pathname),
      };
    });
  },
};

const baseDefines: Record<string, string> = {
  __VERSION__: JSON.stringify(VERSION),
  __TARGET__: JSON.stringify(target),
  __FIREFOX_LEGACY__: JSON.stringify(firefoxLegacy),
};

async function clean() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
}

async function copyManifest() {
  const file = target === 'firefox' ? 'manifest.firefox.json' : 'manifest.chrome.json';
  const src = resolve(ROOT, 'manifest', file);
  const raw = await readFile(src, 'utf8');
  const manifest = JSON.parse(raw);
  manifest.version = VERSION;
  await writeFile(resolve(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

async function copyAsset(rel: string, destRel = rel) {
  const src = resolve(ROOT, rel);
  if (!existsSync(src)) return;
  const dest = resolve(DIST, destRel);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
}

async function copyIcons() {
  for (const size of [16, 32, 48, 128]) {
    await copyAsset(`assets/icons/icon-${size}.png`, `icons/icon-${size}.png`);
    await copyAsset(`assets/icons/icon-mono-${size}.png`, `icons/icon-mono-${size}.png`);
  }
  await copyAsset('assets/icons/favicon.ico', 'icons/favicon.ico');
}

async function copyPopup() {
  const html = await readFile(resolve(SRC, 'popup/popup.html'), 'utf8');
  await writeFile(resolve(DIST, 'popup.html'), html);
}

function entriesForExtension(): Record<string, string> {
  return {
    'auth-sniffer': resolve(SRC, 'injected/auth-sniffer.ts'),
    content: resolve(SRC, 'content/index.ts'),
    background: resolve(SRC, 'background/service-worker.ts'),
    popup: resolve(SRC, 'popup/popup.ts'),
  };
}

const commonExtensionOptions: BuildOptions = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120', 'firefox128'],
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  define: baseDefines,
  plugins: [sassInlinePlugin],
  logLevel: 'info',
};

async function buildExtension() {
  await clean();
  await copyManifest();
  await copyIcons();
  await copyPopup();

  const entries = entriesForExtension();

  // Background: SW format on chrome (esm), classic for firefox compat.
  const bgFormat: BuildOptions['format'] = target === 'chrome' ? 'esm' : 'iife';

  const opts: BuildOptions = {
    ...commonExtensionOptions,
    entryPoints: entries,
    outdir: DIST,
    entryNames: '[name]',
  };

  const bgOpts: BuildOptions = {
    ...commonExtensionOptions,
    entryPoints: { background: entries.background },
    outdir: DIST,
    entryNames: '[name]',
    format: bgFormat,
  };

  // Build content/auth-sniffer/popup as IIFE, background separately.
  const { background: _bg, ...rest } = entries;
  const restOpts: BuildOptions = { ...opts, entryPoints: rest };

  if (watch) {
    const ctx1 = await context(restOpts);
    const ctx2 = await context(bgOpts);
    await Promise.all([ctx1.watch(), ctx2.watch()]);
    console.log(`[build] watching ${target} -> ${DIST}`);
  } else {
    await build(restOpts);
    await build(bgOpts);
    console.log(`[build] ${target} -> ${DIST} (v${VERSION})`);
  }
}

async function buildUserscript() {
  await clean();
  const entry = resolve(SRC, 'content/index.ts');
  const out = resolve(ROOT, 'dist', 'discord-purge.user.js');

  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome120', 'firefox128'],
    minify: false,
    define: { ...baseDefines, __USERSCRIPT__: JSON.stringify(true) },
    plugins: [sassInlinePlugin],
    write: false,
    logLevel: 'info',
  });

  const body = result.outputFiles[0]?.text ?? '';
  const header = [
    '// ==UserScript==',
    `// @name         discord-purge`,
    `// @namespace    https://github.com/dustfeather/discord-purge`,
    `// @version      ${VERSION}`,
    `// @description  Bulk-unsend your own messages from Discord DMs.`,
    `// @author       dustfeather`,
    `// @match        https://discord.com/channels/@me/*`,
    `// @run-at       document-start`,
    `// @grant        none`,
    `// @license      GPL-3.0-only`,
    '// ==/UserScript==',
    '',
  ].join('\n');

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${header}\n${body}`);
  console.log(`[build] userscript -> ${out} (v${VERSION})`);
}

async function main() {
  if (target === 'userscript') return buildUserscript();
  return buildExtension();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 8.2: Lint scripts**

Run: `npx eslint scripts/build.ts`
Expected: passes (or reports only warnings, not errors).

- [ ] **Step 8.3: Commit**

```bash
git add scripts/build.ts
git commit -m "build: add esbuild orchestrator (chrome/firefox/userscript targets)"
```

---

## Phase C — Skeleton extension that loads in Chrome

### Task 9: Chrome MV3 manifest

**Files:**
- Create: `manifest/manifest.chrome.json`

- [ ] **Step 9.1: Create `manifest/manifest.chrome.json`**

```json
{
  "manifest_version": 3,
  "name": "discord-purge",
  "version": "0.0.0",
  "description": "Bulk-unsend your own messages from Discord DMs.",
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["https://discord.com/*"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["https://discord.com/channels/@me/*"],
      "js": ["auth-sniffer.js"],
      "run_at": "document_start",
      "world": "MAIN"
    },
    {
      "matches": ["https://discord.com/channels/@me/*"],
      "js": ["content.js"],
      "run_at": "document_idle",
      "world": "ISOLATED"
    }
  ],
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "web_accessible_resources": [
    {
      "resources": ["auth-sniffer.js"],
      "matches": ["https://discord.com/*"]
    }
  ]
}
```

- [ ] **Step 9.2: Commit**

```bash
git add manifest/manifest.chrome.json
git commit -m "build(chrome): add MV3 manifest with MAIN/ISOLATED content scripts"
```

---

### Task 10: Minimal placeholder source files so the build runs

**Files:**
- Create: `src/injected/auth-sniffer.ts`
- Create: `src/content/index.ts`
- Create: `src/background/service-worker.ts`
- Create: `src/popup/popup.html`
- Create: `src/popup/popup.ts`
- Create: `src/popup/popup.scss`

These are placeholders — real implementations follow in later tasks. Goal: the build succeeds end-to-end.

- [ ] **Step 10.1: Create `src/injected/auth-sniffer.ts`**

```ts
// Placeholder — real implementation in Phase D.
console.warn('[discord-purge] auth-sniffer placeholder loaded');
```

- [ ] **Step 10.2: Create `src/content/index.ts`**

```ts
console.warn('[discord-purge] content placeholder loaded');
```

- [ ] **Step 10.3: Create `src/background/service-worker.ts`**

```ts
self.addEventListener('install', () => {
  console.warn('[discord-purge] background placeholder installed');
});
```

- [ ] **Step 10.4: Create `src/popup/popup.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>discord-purge</title>
    <link rel="icon" href="icons/icon-32.png" />
    <style>
      body { font-family: system-ui, sans-serif; padding: 12px; width: 260px; margin: 0; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script src="popup.js"></script>
  </body>
</html>
```

- [ ] **Step 10.5: Create `src/popup/popup.ts`**

```ts
const root = document.getElementById('root')!;
root.textContent = 'discord-purge';
```

- [ ] **Step 10.6: Create `src/popup/popup.scss` (empty placeholder)**

```scss
// styles inlined into popup.html for now
```

- [ ] **Step 10.7: Build chrome target**

Run: `npm run build:chrome`
Expected: `dist/chrome/{manifest.json, content.js, auth-sniffer.js, background.js, popup.js, popup.html}` exist.

- [ ] **Step 10.8: Verify in Chrome (manual)**

1. Open `chrome://extensions`, enable "Developer mode", click "Load unpacked", select `dist/chrome`.
2. Open `https://discord.com/channels/@me/<any-existing-dm-id>` (signed-in).
3. Open DevTools → Console. Confirm:
   - `[discord-purge] auth-sniffer placeholder loaded` (in **MAIN world** — page console)
   - `[discord-purge] content placeholder loaded` (in **ISOLATED world** — switch the DevTools execution context to "discord-purge")
4. Click the extension's toolbar icon → popup shows "discord-purge".

- [ ] **Step 10.9: Commit**

```bash
git add src/injected src/content src/background src/popup
git commit -m "feat(skeleton): minimal placeholder sources so the chrome build loads end-to-end"
```

---

## Phase D — Auth-capture bridge

### Task 11: MAIN-world auth sniffer

**Files:**
- Modify: `src/injected/auth-sniffer.ts` (replace placeholder with real impl)

- [ ] **Step 11.1: Replace `src/injected/auth-sniffer.ts` with the real implementation**

```ts
import { API_BASE, EVENT_AUTH, RELEVANT_AUTH_HEADERS } from '../shared/constants.js';
import type { AuthHeaders, RelevantAuthHeader } from '../shared/types.js';

(() => {
  if ((window as unknown as { __discordPurgeSniffer?: boolean }).__discordPurgeSniffer) return;
  (window as unknown as { __discordPurgeSniffer: boolean }).__discordPurgeSniffer = true;

  const RELEVANT = new Set<string>(RELEVANT_AUTH_HEADERS);
  let snapshot: AuthHeaders = {};
  let lastEmittedHash = '';

  const isDiscordApi = (url: string | URL | Request) => {
    const s = typeof url === 'string'
      ? url
      : url instanceof URL
      ? url.toString()
      : url.url;
    return s.startsWith(`${API_BASE}/`) || s.startsWith('/api/');
  };

  const captureFromHeaders = (h: Headers) => {
    for (const [k, v] of h.entries()) {
      const lk = k.toLowerCase();
      if (RELEVANT.has(lk)) snapshot[lk as RelevantAuthHeader] = v;
    }
  };

  const emitIfChanged = () => {
    if (!snapshot.authorization) return;
    const hash = JSON.stringify(snapshot);
    if (hash === lastEmittedHash) return;
    lastEmittedHash = hash;
    window.dispatchEvent(
      new CustomEvent(EVENT_AUTH, { detail: { headers: { ...snapshot } } }),
    );
  };

  // -------- fetch wrapper --------
  const origFetch = window.fetch.bind(window);
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    try {
      if (isDiscordApi(input)) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        captureFromHeaders(headers);
        emitIfChanged();
      }
    } catch {
      // never throw from a wrapper
    }
    return origFetch(input as RequestInfo, init);
  };

  // -------- XHR wrapper --------
  type XhrPriv = XMLHttpRequest & { __dpUrl?: string };
  const origOpen = XMLHttpRequest.prototype.open;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (
    this: XhrPriv,
    method: string,
    url: string | URL,
    async = true,
    user?: string | null,
    password?: string | null,
  ) {
    this.__dpUrl = typeof url === 'string' ? url : url.toString();
    return origOpen.call(this, method, url, async, user as string | null, password as string | null);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (
    this: XhrPriv,
    name: string,
    value: string,
  ) {
    try {
      const url = this.__dpUrl ?? '';
      if (isDiscordApi(url) && RELEVANT.has(name.toLowerCase())) {
        snapshot[name.toLowerCase() as RelevantAuthHeader] = value;
        emitIfChanged();
      }
    } catch {
      // never throw
    }
    return origSetHeader.call(this, name, value);
  };
})();
```

- [ ] **Step 11.2: Build**

Run: `npm run build:chrome`
Expected: succeeds.

- [ ] **Step 11.3: Reload extension; verify in Chrome (manual)**

1. `chrome://extensions` → reload the extension card.
2. Reload `https://discord.com/channels/@me/<id>`.
3. In DevTools page-console, run:

```js
window.addEventListener('discord-purge:auth', (e) => console.log('AUTH', e.detail.headers));
```

Then trigger any Discord API request (clicking another DM channel works, or just navigate). Expected: console logs the captured `authorization` header (a long string).

- [ ] **Step 11.4: Commit**

```bash
git add src/injected/auth-sniffer.ts
git commit -m "feat(injected): MAIN-world auth header sniffer with fetch+XHR wrappers"
```

---

### Task 12: ISOLATED-world auth receiver and bus

**Files:**
- Create: `src/content/auth.ts`

- [ ] **Step 12.1: Create `src/content/auth.ts`**

```ts
import { EVENT_AUTH } from '../shared/constants.js';
import type { AuthHeaders } from '../shared/types.js';

let current: AuthHeaders | null = null;
const listeners = new Set<(a: AuthHeaders) => void>();

window.addEventListener(EVENT_AUTH, (e) => {
  const detail = (e as CustomEvent<{ headers: AuthHeaders }>).detail;
  current = detail.headers;
  for (const l of listeners) {
    try { l(current); } catch (err) { console.warn('[discord-purge] auth listener error', err); }
  }
});

export const getAuth = (): AuthHeaders | null => current;

export const onAuth = (cb: (a: AuthHeaders) => void): (() => void) => {
  listeners.add(cb);
  if (current) cb(current);
  return () => listeners.delete(cb);
};
```

- [ ] **Step 12.2: Wire it into `src/content/index.ts` for a manual smoke test**

Replace `src/content/index.ts` with:

```ts
import { onAuth } from './auth.js';

console.warn('[discord-purge] content loaded');
onAuth((h) => {
  console.warn('[discord-purge] auth captured:', Object.keys(h));
});
```

- [ ] **Step 12.3: Build, reload, verify (manual)**

1. `npm run build:chrome`, reload extension, reload Discord DM.
2. Open the **extension** content-script console (DevTools → top-right context dropdown → `discord-purge`). Within ~3 s, a line like `[discord-purge] auth captured: ['authorization', 'x-super-properties', ...]`.

- [ ] **Step 12.4: Commit**

```bash
git add src/content/auth.ts src/content/index.ts
git commit -m "feat(content): ISOLATED-world auth receiver and subscription bus"
```

---

## Phase E — Discord API client

### Task 13: Snowflake helpers

**Files:**
- Create: `src/content/api/snowflake.ts`

- [ ] **Step 13.1: Create `src/content/api/snowflake.ts`**

```ts
import { DISCORD_EPOCH } from '../../shared/constants.js';

/** Convert a JS Date (or ms) to a Discord snowflake threshold (BigInt). */
export const dateToSnowflake = (ms: number): bigint => {
  return BigInt(ms - Number(DISCORD_EPOCH)) << 22n;
};

/** Convert a snowflake string/bigint to its embedded epoch-ms timestamp. */
export const snowflakeToMs = (id: bigint | string): number => {
  const b = typeof id === 'bigint' ? id : BigInt(id);
  return Number((b >> 22n) + DISCORD_EPOCH);
};

/** Validate that a string is a 15–25 digit Discord snowflake (heuristic). */
export const isLikelySnowflake = (s: string): boolean => /^\d{15,25}$/.test(s);
```

- [ ] **Step 13.2: Lint**

Run: `npm run lint`
Expected: passes.

- [ ] **Step 13.3: Commit**

```bash
git add src/content/api/snowflake.ts
git commit -m "feat(api): add snowflake <-> timestamp helpers"
```

---

### Task 14: Discord API types

**Files:**
- Create: `src/content/api/types.ts`

- [ ] **Step 14.1: Create `src/content/api/types.ts`**

```ts
// Subset of Discord's API response shapes used by discord-purge.

export type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  discriminator: string;
};

export type DiscordRecipient = {
  id: string;
  username: string;
  global_name?: string | null;
};

export type DiscordChannel = {
  id: string;
  /** 1 = DM, 3 = Group DM. */
  type: 1 | 3 | number;
  name?: string | null;
  recipients?: DiscordRecipient[];
};

export type DiscordMessage = {
  id: string;
  channel_id: string;
  /**
   * 0  = default
   * 6  = channel pinned
   * 19 = reply
   * 20 = chat-input command
   * other = various system messages
   */
  type: number;
  pinned: boolean;
  author: { id: string };
  timestamp: string;
};

export type ApiResult<T> =
  | { status: number; ok: true; body: T; headers: Headers }
  | { status: number; ok: false; body: unknown; headers: Headers };
```

- [ ] **Step 14.2: Lint**

Run: `npm run lint`
Expected: passes.

- [ ] **Step 14.3: Commit**

```bash
git add src/content/api/types.ts
git commit -m "feat(api): add Discord API response types"
```

---

### Task 15: API client

**Files:**
- Create: `src/content/api/client.ts`

- [ ] **Step 15.1: Create `src/content/api/client.ts`**

```ts
import { API_ROOT } from '../../shared/constants.js';
import type { AuthHeaders } from '../../shared/types.js';
import type { ApiResult, DiscordChannel, DiscordMessage, DiscordUser } from './types.js';

export type ApiClient = {
  getMe(): Promise<DiscordUser>;
  getChannel(id: string): Promise<DiscordChannel>;
  listMessages(channelId: string, opts: { limit: number; before?: string }): Promise<DiscordMessage[]>;
  deleteMessage(channelId: string, messageId: string): Promise<ApiResult<void>>;
};

export type CreateClientArgs = {
  getAuth: () => AuthHeaders | null;
  runId: string;
};

export const createApiClient = ({ getAuth, runId }: CreateClientArgs): ApiClient => {
  const callJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const res = await call(path, init);
    if (!res.ok) {
      throw new Error(`Discord API ${res.status} on ${path}`);
    }
    return res.body as T;
  };

  const call = async (path: string, init: RequestInit = {}): Promise<ApiResult<unknown>> => {
    const auth = getAuth();
    if (!auth?.authorization) throw new Error('no-auth');

    const headers = new Headers(init.headers ?? {});
    for (const [k, v] of Object.entries(auth)) {
      if (v) headers.set(k, v);
    }
    headers.set('X-Discord-Purge-Run', runId);

    const res = await fetch(`${API_ROOT}${path}`, { ...init, headers, credentials: 'include' });
    let body: unknown;
    if (res.status !== 204) {
      const text = await res.text();
      try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
    }
    if (res.ok) {
      return { status: res.status, ok: true, body: body as never, headers: res.headers };
    }
    return { status: res.status, ok: false, body, headers: res.headers };
  };

  return {
    getMe: () => callJson<DiscordUser>('/users/@me'),
    getChannel: (id) => callJson<DiscordChannel>(`/channels/${encodeURIComponent(id)}`),
    listMessages: async (channelId, { limit, before }) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (before) params.set('before', before);
      return callJson<DiscordMessage[]>(`/channels/${encodeURIComponent(channelId)}/messages?${params}`);
    },
    deleteMessage: (channelId, messageId) =>
      call(
        `/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
        { method: 'DELETE' },
      ) as Promise<ApiResult<void>>,
  };
};
```

- [ ] **Step 15.2: Lint**

Run: `npm run lint`
Expected: passes.

- [ ] **Step 15.3: Commit**

```bash
git add src/content/api/client.ts
git commit -m "feat(api): add Discord API client with captured-header injection"
```

---

## Phase F — Runner (scheduler / filters / loop)

### Task 16: Scheduler

**Files:**
- Create: `src/content/runner/scheduler.ts`

- [ ] **Step 16.1: Create `src/content/runner/scheduler.ts`**

```ts
import { RUN_CONFIG } from '../../shared/constants.js';

export const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException('aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export const jitteredSleep = (
  baseMs: number = RUN_CONFIG.baseDelayMs,
  signal?: AbortSignal,
): Promise<void> => {
  const jitter = baseMs * RUN_CONFIG.jitterRatio;
  const ms = Math.max(0, baseMs + (Math.random() * 2 - 1) * jitter);
  return sleep(ms, signal);
};

export const backoffMs = (attempt: number): number =>
  Math.min(RUN_CONFIG.backoffCapMs, 1000 * 2 ** attempt);

/**
 * Read Retry-After from response. Discord returns either a JSON body with
 * `retry_after` (seconds, float) or a plain header (seconds). Returns ms,
 * floored to RUN_CONFIG.minRetryAfterMs.
 */
export const readRetryAfterMs = async (
  res: Response | { headers: Headers; body?: unknown },
): Promise<number> => {
  const header = (res.headers.get('retry-after') ?? '').trim();
  let seconds: number | undefined;
  if (header) {
    const n = Number(header);
    if (Number.isFinite(n)) seconds = n;
  }
  if (seconds === undefined && (res as { body?: unknown }).body) {
    const body = (res as { body?: unknown }).body as { retry_after?: unknown };
    if (typeof body.retry_after === 'number') seconds = body.retry_after;
  }
  const ms = (seconds ?? 5) * 1000;
  return Math.max(RUN_CONFIG.minRetryAfterMs, ms);
};
```

- [ ] **Step 16.2: Lint**

Run: `npm run lint`
Expected: passes.

- [ ] **Step 16.3: Commit**

```bash
git add src/content/runner/scheduler.ts
git commit -m "feat(runner): add jittered sleep, backoff, retry-after parsing"
```

---

### Task 17: Filters and boundary parsing

**Files:**
- Create: `src/content/runner/filters.ts`

- [ ] **Step 17.1: Create `src/content/runner/filters.ts`**

```ts
import { dateToSnowflake, isLikelySnowflake } from '../api/snowflake.js';
import type { DiscordMessage } from '../api/types.js';
import type { Boundary } from '../../shared/types.js';

export type ParsedBoundary = bigint | null;

export const parseBoundary = (b: Boundary): ParsedBoundary => {
  if (b.kind === 'none') return null;
  if (b.kind === 'datetime') {
    const ms = Date.parse(b.iso);
    if (!Number.isFinite(ms)) return null;
    return dateToSnowflake(ms);
  }
  if (b.kind === 'messageId') {
    if (!isLikelySnowflake(b.id)) return null;
    return BigInt(b.id);
  }
  return null;
};

const ALLOWED_TYPES = new Set([0, 19, 20]);

export const candidate = (
  m: DiscordMessage,
  selfId: string,
  boundary: ParsedBoundary,
): boolean => {
  if (m.author.id !== selfId) return false;
  if (m.pinned) return false;
  if (!ALLOWED_TYPES.has(m.type)) return false;
  if (boundary !== null && BigInt(m.id) >= boundary) return false;
  return true;
};
```

- [ ] **Step 17.2: Lint**

Run: `npm run lint`
Expected: passes.

- [ ] **Step 17.3: Commit**

```bash
git add src/content/runner/filters.ts
git commit -m "feat(runner): add boundary parsing and per-message candidate filter"
```

---

### Task 18: Logger (ring-buffered)

**Files:**
- Create: `src/content/log/log.ts`

- [ ] **Step 18.1: Create `src/content/log/log.ts`**

```ts
import type { LogLine } from '../../shared/types.js';

export type LogListener = (line: LogLine, all: readonly LogLine[]) => void;

export class Logger {
  private readonly capacity: number;
  private readonly buffer: LogLine[] = [];
  private readonly listeners = new Set<LogListener>();

  constructor(capacity = 200) {
    this.capacity = capacity;
  }

  append(msg: string): LogLine {
    const line: LogLine = { ts: Date.now(), msg };
    this.buffer.push(line);
    if (this.buffer.length > this.capacity) this.buffer.splice(0, this.buffer.length - this.capacity);
    for (const l of this.listeners) {
      try { l(line, this.buffer); } catch { /* noop */ }
    }
    return line;
  }

  lines(): readonly LogLine[] {
    return this.buffer;
  }

  subscribe(l: LogListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  clear(): void {
    this.buffer.length = 0;
  }
}
```

- [ ] **Step 18.2: Commit**

```bash
git add src/content/log/log.ts
git commit -m "feat(log): add ring-buffered logger with subscription"
```

---

### Task 19: Runner main loop

**Files:**
- Create: `src/content/runner/runner.ts`

- [ ] **Step 19.1: Create `src/content/runner/runner.ts`**

```ts
import { RUN_CONFIG } from '../../shared/constants.js';
import type { ApiClient } from '../api/client.js';
import type { DiscordUser } from '../api/types.js';
import type { Logger } from '../log/log.js';
import type { Boundary, RunStats } from '../../shared/types.js';
import { backoffMs, jitteredSleep, readRetryAfterMs, sleep } from './scheduler.js';
import { candidate, parseBoundary } from './filters.js';

export type RunArgs = {
  channelId: string;
  boundary: Boundary;
  api: ApiClient;
  logger: Logger;
  signal: AbortSignal;
  onStats?: (s: RunStats) => void;
};

export const emptyStats = (): RunStats => ({
  scanned: 0,
  deleted: 0,
  skipped: 0,
  alreadyGone: 0,
  forbidden: 0,
  errors: 0,
});

export const runPurge = async ({
  channelId,
  boundary,
  api,
  logger,
  signal,
  onStats,
}: RunArgs): Promise<RunStats> => {
  const stats = emptyStats();
  const emit = () => onStats?.({ ...stats });

  const boundarySnowflake = parseBoundary(boundary);
  const me: DiscordUser = await api.getMe();
  logger.append(`run: target channel=${channelId} as user=${me.id}`);
  if (boundarySnowflake !== null) logger.append(`run: boundary snowflake = ${boundarySnowflake}`);

  let cursor: string | undefined;
  while (!signal.aborted) {
    let page: Awaited<ReturnType<ApiClient['listMessages']>>;
    try {
      page = await api.listMessages(channelId, { limit: 100, before: cursor });
    } catch (e) {
      stats.errors++;
      logger.append(`list failed: ${(e as Error).message}`);
      emit();
      return stats;
    }
    if (page.length === 0) {
      logger.append('done: history exhausted');
      break;
    }
    cursor = page[page.length - 1]!.id;
    stats.scanned += page.length;

    const targets = page.filter((m) => candidate(m, me.id, boundarySnowflake));
    const skippedThisPage = page.length - targets.length;
    stats.skipped += skippedThisPage;
    emit();

    for (const m of targets) {
      if (signal.aborted) {
        logger.append('aborted');
        emit();
        return stats;
      }
      await jitteredSleep(RUN_CONFIG.baseDelayMs, signal).catch(() => undefined);
      if (signal.aborted) return stats;

      let attempt = 0;
      while (attempt < RUN_CONFIG.maxAttempts && !signal.aborted) {
        const res = await api.deleteMessage(channelId, m.id);
        if (res.status === 204) { stats.deleted++; emit(); break; }
        if (res.status === 404) { stats.alreadyGone++; emit(); break; }
        if (res.status === 403) {
          stats.forbidden++;
          logger.append(`forbidden ${m.id}`);
          emit();
          break;
        }
        if (res.status === 429) {
          const wait = await readRetryAfterMs({ headers: res.headers, body: res.body });
          logger.append(`rate-limited; sleeping ${wait} ms`);
          await sleep(wait, signal).catch(() => undefined);
          attempt++;
          continue;
        }
        if (res.status >= 500) {
          const wait = backoffMs(attempt);
          logger.append(`server ${res.status}; backoff ${wait} ms`);
          await sleep(wait, signal).catch(() => undefined);
          attempt++;
          continue;
        }
        stats.errors++;
        logger.append(`unexpected ${res.status} for ${m.id}`);
        emit();
        break;
      }
      if (attempt >= RUN_CONFIG.maxAttempts) {
        stats.errors++;
        logger.append(`gave up on ${m.id} after ${RUN_CONFIG.maxAttempts} attempts`);
        emit();
      }
    }
  }
  return stats;
};
```

- [ ] **Step 19.2: Lint**

Run: `npm run lint`
Expected: passes.

- [ ] **Step 19.3: Commit**

```bash
git add src/content/runner/runner.ts
git commit -m "feat(runner): purge loop with serial DELETEs, 429 backoff, abort handling"
```

---

## Phase G — Background SW + popup

### Task 20: Background service worker (storage broker only)

**Files:**
- Modify: `src/background/service-worker.ts`

- [ ] **Step 20.1: Replace placeholder `src/background/service-worker.ts`**

```ts
import type { BgResponse, ContentToBg } from '../shared/messages.js';
import { STORAGE_KEYS } from '../shared/constants.js';
import type { LogLine, RunStats } from '../shared/types.js';

const LOG_CAPACITY = 200;

const get = async <T>(key: string): Promise<T | undefined> => {
  const r = await chrome.storage.local.get(key);
  return r[key] as T | undefined;
};

const set = async <T>(key: string, value: T): Promise<void> => {
  await chrome.storage.local.set({ [key]: value });
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    try {
      const m = message as ContentToBg;
      const ok = (data?: unknown): BgResponse => ({ ok: true, data });

      switch (m.kind) {
        case 'log:append': {
          const lines = (await get<LogLine[]>(STORAGE_KEYS.log)) ?? [];
          lines.push(m.line);
          if (lines.length > LOG_CAPACITY) lines.splice(0, lines.length - LOG_CAPACITY);
          await set(STORAGE_KEYS.log, lines);
          sendResponse(ok());
          return;
        }
        case 'log:read': {
          sendResponse(ok((await get<LogLine[]>(STORAGE_KEYS.log)) ?? []));
          return;
        }
        case 'log:clear': {
          await set<LogLine[]>(STORAGE_KEYS.log, []);
          sendResponse(ok());
          return;
        }
        case 'stats:save': {
          await set<RunStats>(STORAGE_KEYS.stats, m.stats);
          sendResponse(ok());
          return;
        }
        case 'stats:read': {
          sendResponse(ok((await get<RunStats>(STORAGE_KEYS.stats)) ?? null));
          return;
        }
        case 'panel:setPosition': {
          await set(STORAGE_KEYS.panelPosition, { x: m.x, y: m.y });
          sendResponse(ok());
          return;
        }
        case 'panel:getPosition': {
          sendResponse(ok((await get<{ x: number; y: number }>(STORAGE_KEYS.panelPosition)) ?? null));
          return;
        }
        case 'panel:setCollapsed': {
          await set(STORAGE_KEYS.panelCollapsed, m.collapsed);
          sendResponse(ok());
          return;
        }
        case 'panel:getCollapsed': {
          sendResponse(ok((await get<boolean>(STORAGE_KEYS.panelCollapsed)) ?? false));
          return;
        }
      }
    } catch (e) {
      sendResponse({ ok: false, error: (e as Error).message });
    }
  })();
  return true;
});
```

- [ ] **Step 20.2: Build, reload, verify (manual)**

1. `npm run build:chrome` → reload extension.
2. In the extension's content-script console:

```js
chrome.runtime.sendMessage({kind:'log:append', line:{ts:Date.now(), msg:'hello'}}, console.log);
chrome.runtime.sendMessage({kind:'log:read'}, console.log);
```

Expected: first call returns `{ok:true}`, second returns `{ok:true, data:[{ts:..., msg:'hello'}]}`.

- [ ] **Step 20.3: Commit**

```bash
git add src/background/service-worker.ts
git commit -m "feat(background): storage broker for logs, stats, panel position/collapsed"
```

---

### Task 21: Popup (open-DM helper)

**Files:**
- Modify: `src/popup/popup.html`
- Modify: `src/popup/popup.ts`
- Modify: `src/popup/popup.scss`

- [ ] **Step 21.1: Replace `src/popup/popup.scss`**

```scss
:root {
  --bg: #313338;
  --fg: #DBDEE1;
  --muted: #949BA4;
  --brand: #5865F2;
  --brand-hover: #4752C4;
}
@media (prefers-color-scheme: light) {
  :root { --bg: #FFFFFF; --fg: #2E3338; --muted: #5C5E66; }
}
html, body { margin: 0; }
body {
  font: 13px/1.4 'gg sans', 'Noto Sans', system-ui, sans-serif;
  background: var(--bg);
  color: var(--fg);
  width: 280px;
  padding: 12px 14px;
}
h1 { font-size: 14px; font-weight: 600; margin: 0 0 8px; }
p { margin: 0 0 10px; color: var(--muted); }
button {
  width: 100%; height: 32px; border: none; border-radius: 3px;
  background: var(--brand); color: white; font-weight: 500; cursor: pointer;
}
button:hover { background: var(--brand-hover); }
```

- [ ] **Step 21.2: Replace `src/popup/popup.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>discord-purge</title>
    <link rel="icon" href="icons/icon-32.png" />
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <h1>discord-purge</h1>
    <p id="msg">Open a Discord DM (<code>discord.com/channels/@me/...</code>) to use this extension.</p>
    <button id="open">Open Discord DMs</button>
    <script src="popup.js"></script>
  </body>
</html>
```

- [ ] **Step 21.3: Update build script to compile popup.scss → popup.css**

Modify `scripts/build.ts`. After the `copyPopup` function:

```ts
async function compilePopupCss() {
  const result = sass.compile(resolve(SRC, 'popup/popup.scss'), { style: 'compressed' });
  await writeFile(resolve(DIST, 'popup.css'), result.css);
}
```

Then call `await compilePopupCss();` immediately after `await copyPopup();` inside `buildExtension()`.

- [ ] **Step 21.4: Replace `src/popup/popup.ts`**

```ts
const btn = document.getElementById('open') as HTMLButtonElement | null;
btn?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = 'https://discord.com/channels/@me/';
  if (tab?.id && tab.url?.startsWith('https://discord.com/')) {
    await chrome.tabs.update(tab.id, { url });
  } else {
    await chrome.tabs.create({ url });
  }
  window.close();
});
```

- [ ] **Step 21.5: Build, reload, verify (manual)**

`npm run build:chrome`, reload, click toolbar icon. Popup shows the message + button. Clicking navigates the active tab (or opens a new tab) to `https://discord.com/channels/@me/`.

- [ ] **Step 21.6: Commit**

```bash
git add src/popup scripts/build.ts
git commit -m "feat(popup): Discord-styled open-DM helper popup"
```

---

## Phase H — UI foundation

### Task 22: `h()` helper

**Files:**
- Create: `src/content/ui/h.ts`

- [ ] **Step 22.1: Create `src/content/ui/h.ts`**

```ts
type Attrs = Record<string, unknown> & { style?: Partial<CSSStyleDeclaration> };
type Child = Node | string | number | false | null | undefined;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  children?: Child[] | Child,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v as Partial<CSSStyleDeclaration>);
      } else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (k === 'className') {
        el.className = String(v);
      } else if (k === 'dataset' && typeof v === 'object' && v !== null) {
        for (const [dk, dv] of Object.entries(v as Record<string, string>)) {
          el.dataset[dk] = dv;
        }
      } else if (typeof v === 'boolean') {
        if (v) el.setAttribute(k, '');
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
```

- [ ] **Step 22.2: Commit**

```bash
git add src/content/ui/h.ts
git commit -m "feat(ui): add minimal h() element-creation helper"
```

---

### Task 23: Discord-token SCSS (theme variables + base)

**Files:**
- Create: `src/content/ui/styles.scss`

- [ ] **Step 23.1: Create `src/content/ui/styles.scss`**

```scss
:host {
  --bg-base: #313338;
  --bg-mod: rgba(78,80,88,0.16);
  --bg-input: #1E1F22;
  --text-normal: #DBDEE1;
  --text-muted: #949BA4;
  --separator: #3F4147;
  --brand: #5865F2;
  --brand-hover: #4752C4;
  --danger: #DA373C;
  --danger-hover: #A12828;
  --success: #23A559;

  all: initial;
  font-family: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
}

:host([data-theme='light']) {
  --bg-base: #FFFFFF;
  --bg-mod: rgba(116,127,141,0.08);
  --bg-input: #EBEDEF;
  --text-normal: #2E3338;
  --text-muted: #5C5E66;
  --separator: #E3E5E8;
  --danger: #D83C3E;
}

.panel {
  position: fixed;
  right: 16px;
  bottom: 16px;
  width: 360px;
  max-height: 520px;
  display: flex;
  flex-direction: column;
  background: var(--bg-base);
  color: var(--text-normal);
  border: 1px solid var(--separator);
  border-radius: 8px;
  box-shadow: 0 8px 16px rgba(0,0,0,0.24);
  z-index: 2147483000;
  overflow: hidden;
  font-size: 14px;
  line-height: 1.4;
}

.panel[data-collapsed='true'] .panel-body { display: none; }
.panel[data-collapsed='true'] { max-height: 40px; }

.header {
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  cursor: grab;
  user-select: none;
  border-bottom: 1px solid var(--separator);
  background: var(--bg-base);
}
.header:active { cursor: grabbing; }
.header h2 { flex: 1; margin: 0; font-size: 14px; font-weight: 600; }
.icon-btn {
  width: 24px; height: 24px; padding: 0; border: 0; border-radius: 3px;
  background: transparent; color: var(--text-muted); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.icon-btn:hover { background: var(--bg-mod); color: var(--text-normal); }
.icon-btn svg { width: 14px; height: 14px; }

.panel-body { display: flex; flex-direction: column; overflow: auto; }

.section { padding: 10px 12px; border-bottom: 1px solid var(--separator); }
.section:last-of-type { border-bottom: 0; }
.section-label {
  font-size: 12px; font-weight: 700; letter-spacing: 0.02em;
  text-transform: uppercase; color: var(--text-muted); margin: 0 0 6px;
}

.target-line { color: var(--text-normal); }
.target-line .id { color: var(--text-muted); font-family: ui-monospace, Consolas, monospace; font-size: 12px; }

.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--separator); margin-bottom: 8px; }
.tab {
  height: 28px; padding: 0 12px; background: transparent; border: 0;
  color: var(--text-muted); cursor: pointer; font-size: 13px;
  border-radius: 3px 3px 0 0; position: relative;
  transition: background-color 100ms ease;
}
.tab:hover { background: var(--bg-mod); color: var(--text-normal); }
.tab[aria-selected='true'] {
  color: var(--text-normal); background: var(--bg-mod);
}
.tab[aria-selected='true']::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px;
  background: var(--brand);
  transition: transform 150ms ease-out;
}

input[type='datetime-local'], input[type='text'] {
  width: 100%;
  height: 32px;
  background: var(--bg-input);
  color: var(--text-normal);
  border: 1px solid var(--separator);
  border-radius: 3px;
  padding: 0 8px;
  font-size: 13px;
  box-sizing: border-box;
  font-family: inherit;
  outline: none;
}
input:focus { border-color: var(--brand); }
.help { font-size: 12px; color: var(--text-muted); margin: 6px 0 0; }

.stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.stat { display: flex; flex-direction: column; gap: 2px; }
.stat-label { color: var(--text-muted); font-size: 11px; text-transform: uppercase; }
.stat-value {
  font-family: ui-monospace, Consolas, monospace;
  color: var(--text-normal);
  font-size: 14px;
}

.log-box {
  position: relative;
  height: 144px; overflow: auto;
  background: var(--bg-input); border: 1px solid var(--separator); border-radius: 3px;
  padding: 8px; font: 12px/1.45 ui-monospace, Consolas, 'Andale Mono WT', 'Andale Mono', 'Lucida Console', monospace;
  color: var(--text-normal);
}
.log-line { white-space: pre-wrap; word-break: break-word; }
.log-line .ts { color: var(--text-muted); margin-right: 8px; }
.log-newpill {
  position: absolute; top: 6px; right: 6px;
  background: var(--brand); color: white;
  padding: 2px 8px; border-radius: 9px; font-size: 11px; cursor: pointer;
}

.btn-primary, .btn-cancel {
  display: inline-flex; align-items: center; justify-content: center;
  width: calc(100% - 24px); margin: 12px;
  height: 38px; border: 0; border-radius: 3px; cursor: pointer;
  font-weight: 500; font-size: 14px; color: white;
  transition: background-color 100ms ease;
}
.btn-primary { background: var(--brand); }
.btn-primary:hover { background: var(--brand-hover); }
.btn-primary:disabled { background: var(--brand); opacity: 0.4; cursor: not-allowed; }
.btn-cancel { background: var(--danger); }
.btn-cancel:hover { background: var(--danger-hover); }

.btn-primary:focus-visible, .btn-cancel:focus-visible,
.tab:focus-visible, .icon-btn:focus-visible, input:focus-visible {
  outline: 2px solid var(--brand); outline-offset: 1px;
}

.spinner {
  width: 14px; height: 14px; margin-right: 8px; flex: 0 0 auto;
  border: 2px solid rgba(255,255,255,0.4); border-top-color: white;
  border-radius: 50%; animation: dpspin 0.8s linear infinite;
}
@keyframes dpspin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
  }
}
```

- [ ] **Step 23.2: Commit**

```bash
git add src/content/ui/styles.scss
git commit -m "style(ui): Discord-native SCSS tokens, layout, controls"
```

---

### Task 24: Theme observer

**Files:**
- Create: `src/content/ui/theme.ts`

- [ ] **Step 24.1: Create `src/content/ui/theme.ts`**

```ts
export type Theme = 'dark' | 'light';

export type ThemeWatcher = {
  current(): Theme;
  subscribe(cb: (t: Theme) => void): () => void;
  destroy(): void;
};

const detectTheme = (): Theme => {
  const cls = document.documentElement.classList;
  if (cls.contains('theme-light')) return 'light';
  if (cls.contains('theme-dark')) return 'dark';
  return 'dark';
};

export const watchTheme = (): ThemeWatcher => {
  let current = detectTheme();
  const listeners = new Set<(t: Theme) => void>();
  const obs = new MutationObserver(() => {
    const next = detectTheme();
    if (next === current) return;
    current = next;
    for (const l of listeners) {
      try { l(current); } catch { /* noop */ }
    }
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return {
    current: () => current,
    subscribe(cb) {
      listeners.add(cb);
      cb(current);
      return () => listeners.delete(cb);
    },
    destroy() {
      obs.disconnect();
      listeners.clear();
    },
  };
};
```

- [ ] **Step 24.2: Commit**

```bash
git add src/content/ui/theme.ts
git commit -m "feat(ui): theme watcher mirroring Discord's theme-dark/theme-light class"
```

---

### Task 25: SPA navigation handler

**Files:**
- Create: `src/content/ui/nav.ts`

- [ ] **Step 25.1: Create `src/content/ui/nav.ts`**

```ts
import { EVENT_LOCATION, ROUTE_DM_REGEX } from '../../shared/constants.js';

export type LocationState = {
  isDm: boolean;
  channelId: string | null;
};

let installed = false;

export const installNavListener = (): void => {
  if (installed) return;
  installed = true;
  const wrap = (key: 'pushState' | 'replaceState') => {
    const orig = history[key];
    history[key] = function (this: History, ...args: Parameters<History['pushState']>) {
      const r = orig.apply(this, args);
      window.dispatchEvent(new Event(EVENT_LOCATION));
      return r;
    };
  };
  wrap('pushState');
  wrap('replaceState');
  window.addEventListener('popstate', () => window.dispatchEvent(new Event(EVENT_LOCATION)));
};

export const readLocation = (): LocationState => {
  const path = window.location.pathname;
  const m = path.match(ROUTE_DM_REGEX);
  return { isDm: !!m, channelId: m?.[1] ?? null };
};

export const onLocationChange = (cb: (s: LocationState) => void): (() => void) => {
  const handler = () => cb(readLocation());
  window.addEventListener(EVENT_LOCATION, handler);
  return () => window.removeEventListener(EVENT_LOCATION, handler);
};
```

- [ ] **Step 25.2: Commit**

```bash
git add src/content/ui/nav.ts
git commit -m "feat(ui): SPA-navigation listener with locationchange event"
```

---

### Task 26: Drag-to-move

**Files:**
- Create: `src/content/ui/drag.ts`

- [ ] **Step 26.1: Create `src/content/ui/drag.ts`**

```ts
export type Position = { x: number; y: number };

export type DragOptions = {
  panel: HTMLElement;
  handle: HTMLElement;
  initial: Position | null;
  onChange: (p: Position) => void;
  onReset: () => void;
};

const HEADER_VISIBLE = 40;

const clamp = (p: Position, panel: HTMLElement): Position => {
  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.min(Math.max(p.x, -w + HEADER_VISIBLE), vw - HEADER_VISIBLE),
    y: Math.min(Math.max(p.y, 0), vh - HEADER_VISIBLE),
  };
};

export const installDrag = ({ panel, handle, initial, onChange, onReset }: DragOptions): (() => void) => {
  if (initial) {
    const p = clamp(initial, panel);
    panel.style.left = `${p.x}px`;
    panel.style.top = `${p.y}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.icon-btn')) return; // don't drag from header buttons
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = panel.getBoundingClientRect();
    originX = rect.left;
    originY = rect.top;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const next = clamp({ x: originX + (e.clientX - startX), y: originY + (e.clientY - startY) }, panel);
    panel.style.left = `${next.x}px`;
    panel.style.top = `${next.y}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    try { handle.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    const rect = panel.getBoundingClientRect();
    onChange({ x: rect.left, y: rect.top });
  };
  const onDoubleClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.icon-btn')) return;
    panel.style.left = '';
    panel.style.top = '';
    panel.style.right = '16px';
    panel.style.bottom = '16px';
    onReset();
  };
  const onResize = () => {
    const rect = panel.getBoundingClientRect();
    const next = clamp({ x: rect.left, y: rect.top }, panel);
    if (next.x !== rect.left || next.y !== rect.top) {
      panel.style.left = `${next.x}px`;
      panel.style.top = `${next.y}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }
  };

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('pointercancel', onPointerUp);
  handle.addEventListener('dblclick', onDoubleClick);
  window.addEventListener('resize', onResize);

  return () => {
    handle.removeEventListener('pointerdown', onPointerDown);
    handle.removeEventListener('pointermove', onPointerMove);
    handle.removeEventListener('pointerup', onPointerUp);
    handle.removeEventListener('pointercancel', onPointerUp);
    handle.removeEventListener('dblclick', onDoubleClick);
    window.removeEventListener('resize', onResize);
  };
};
```

- [ ] **Step 26.2: Commit**

```bash
git add src/content/ui/drag.ts
git commit -m "feat(ui): drag-to-move with viewport clamping and double-click reset"
```

---

## Phase I — UI components

### Task 27: Section + header components

**Files:**
- Create: `src/content/ui/components/section.ts`
- Create: `src/content/ui/components/header.ts`

- [ ] **Step 27.1: Create `src/content/ui/components/section.ts`**

```ts
import { h } from '../h.js';

export const renderSection = (label: string, body: HTMLElement): HTMLElement =>
  h('section', { className: 'section' }, [
    h('h3', { className: 'section-label' }, label),
    body,
  ]);
```

- [ ] **Step 27.2: Create `src/content/ui/components/header.ts`**

```ts
import { h } from '../h.js';

const ICON_CHEVRON = `<svg viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_CLOSE = `<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

const iconBtn = (svg: string, title: string, onClick: () => void): HTMLButtonElement => {
  const b = h('button', {
    className: 'icon-btn',
    type: 'button',
    title,
    'aria-label': title,
    onClick,
  });
  b.innerHTML = svg;
  return b;
};

export type HeaderApi = {
  el: HTMLElement;
  setCollapsed(c: boolean): void;
};

export const renderHeader = (opts: {
  onToggleCollapse: (next: boolean) => void;
  onClose: () => void;
  initialCollapsed: boolean;
}): HeaderApi => {
  let collapsed = opts.initialCollapsed;
  const collapse = iconBtn(ICON_CHEVRON, 'Collapse', () => {
    collapsed = !collapsed;
    opts.onToggleCollapse(collapsed);
    update();
  });
  const close = iconBtn(ICON_CLOSE, 'Close', () => opts.onClose());

  const el = h('header', { className: 'header', role: 'group', 'aria-label': 'discord-purge header' }, [
    h('h2', null, 'discord-purge'),
    collapse,
    close,
  ]);

  const update = () => {
    collapse.style.transform = collapsed ? 'rotate(180deg)' : '';
  };
  update();

  return {
    el,
    setCollapsed(c: boolean) {
      collapsed = c;
      update();
    },
  };
};
```

- [ ] **Step 27.3: Commit**

```bash
git add src/content/ui/components/section.ts src/content/ui/components/header.ts
git commit -m "feat(ui): section heading + draggable header with collapse/close buttons"
```

---

### Task 28: Target component

**Files:**
- Create: `src/content/ui/components/target.ts`

- [ ] **Step 28.1: Create `src/content/ui/components/target.ts`**

```ts
import type { ApiClient } from '../../api/client.js';
import type { DiscordChannel } from '../../api/types.js';
import { h } from '../h.js';

export type TargetApi = {
  el: HTMLElement;
  setChannel(channel: DiscordChannel | null): void;
  /** Resolve the current channel via API and update display. */
  refresh(channelId: string, api: ApiClient): Promise<DiscordChannel | null>;
};

const describe = (c: DiscordChannel): string => {
  if (c.type === 1) {
    const r = c.recipients?.[0];
    const name = r ? `@${r.global_name ?? r.username}` : 'unknown user';
    return `DM with ${name}`;
  }
  if (c.type === 3) {
    const names = (c.recipients ?? []).map((r) => `@${r.global_name ?? r.username}`).join(', ');
    return `Group DM (${(c.recipients ?? []).length + 1} members)${names ? ': ' + names : ''}`;
  }
  return c.name ?? `Channel ${c.id}`;
};

export const renderTarget = (): TargetApi => {
  const text = h('div', { className: 'target-line' }, '—');
  const id = h('div', { className: 'target-line id' }, '');
  const el = h('div', null, [text, id]);

  return {
    el,
    setChannel(c) {
      if (!c) {
        text.textContent = '—';
        id.textContent = '';
        return;
      }
      text.textContent = describe(c);
      id.textContent = c.id;
    },
    async refresh(channelId, api) {
      try {
        const c = await api.getChannel(channelId);
        this.setChannel(c);
        return c;
      } catch {
        text.textContent = 'Channel info unavailable';
        id.textContent = channelId;
        return null;
      }
    },
  };
};
```

- [ ] **Step 28.2: Commit**

```bash
git add src/content/ui/components/target.ts
git commit -m "feat(ui): target component with channel-info resolution"
```

---

### Task 29: Boundary picker

**Files:**
- Create: `src/content/ui/components/boundary.ts`

- [ ] **Step 29.1: Create `src/content/ui/components/boundary.ts`**

```ts
import { isLikelySnowflake } from '../../api/snowflake.js';
import type { Boundary } from '../../../shared/types.js';
import { h } from '../h.js';

export type BoundaryApi = {
  el: HTMLElement;
  value(): Boundary;
};

type Mode = 'none' | 'datetime' | 'messageId';

export const renderBoundary = (): BoundaryApi => {
  let mode: Mode = 'none';

  const tab = (label: string, m: Mode) =>
    h('button', {
      type: 'button',
      role: 'tab',
      className: 'tab',
      'aria-selected': mode === m ? 'true' : 'false',
      onClick: () => {
        mode = m;
        for (const t of tabs) t.setAttribute('aria-selected', t === el ? 'true' : 'false');
        // re-evaluate selection
        for (const [tt, mm] of tabPairs) {
          tt.setAttribute('aria-selected', mm === mode ? 'true' : 'false');
        }
        renderInputs();
      },
    }, label);

  const tabPairs: [HTMLButtonElement, Mode][] = [];
  const tabs: HTMLButtonElement[] = [];
  const tabsRow = h('div', { className: 'tabs', role: 'tablist' });
  for (const [label, m] of [['None', 'none'], ['Datetime', 'datetime'], ['Message ID', 'messageId']] as const) {
    const t = tab(label, m);
    tabs.push(t);
    tabPairs.push([t, m]);
    tabsRow.appendChild(t);
  }
  // mark first selected
  tabs[0]?.setAttribute('aria-selected', 'true');

  const inputArea = h('div', null);
  const help = h('p', { className: 'help' }, 'Only delete messages older than this.');

  const datetimeInput = h('input', { type: 'datetime-local', step: '60' }) as HTMLInputElement;
  const messageInput = h('input', {
    type: 'text',
    inputmode: 'numeric',
    pattern: '\\d{15,25}',
    placeholder: 'e.g. 1081268290455879770',
  }) as HTMLInputElement;

  const renderInputs = () => {
    inputArea.replaceChildren();
    if (mode === 'datetime') inputArea.appendChild(datetimeInput);
    if (mode === 'messageId') inputArea.appendChild(messageInput);
    help.style.visibility = mode === 'none' ? 'hidden' : 'visible';
  };
  renderInputs();

  const el = h('div', null, [tabsRow, inputArea, help]);

  return {
    el,
    value(): Boundary {
      if (mode === 'none') return { kind: 'none' };
      if (mode === 'datetime') {
        const v = datetimeInput.value.trim();
        if (!v) return { kind: 'none' };
        return { kind: 'datetime', iso: v };
      }
      const v = messageInput.value.trim();
      if (!v || !isLikelySnowflake(v)) return { kind: 'none' };
      return { kind: 'messageId', id: v };
    },
  };
};
```

- [ ] **Step 29.2: Commit**

```bash
git add src/content/ui/components/boundary.ts
git commit -m "feat(ui): boundary segmented control with datetime + message-id inputs"
```

---

### Task 30: Stats row

**Files:**
- Create: `src/content/ui/components/stats.ts`

- [ ] **Step 30.1: Create `src/content/ui/components/stats.ts`**

```ts
import type { RunStats } from '../../../shared/types.js';
import { h } from '../h.js';

export type StatsApi = { el: HTMLElement; update(s: RunStats): void };

const cell = (label: string) => {
  const value = h('div', { className: 'stat-value' }, '0');
  const el = h('div', { className: 'stat' }, [
    h('div', { className: 'stat-label' }, label),
    value,
  ]);
  return { el, value };
};

export const renderStats = (): StatsApi => {
  const scanned = cell('Scanned');
  const deleted = cell('Deleted');
  const skipped = cell('Skipped');
  const errors = cell('Errors');
  const el = h('div', { className: 'stat-row', role: 'group', 'aria-label': 'run statistics' }, [
    scanned.el, deleted.el, skipped.el, errors.el,
  ]);

  return {
    el,
    update(s) {
      scanned.value.textContent = String(s.scanned);
      deleted.value.textContent = String(s.deleted);
      skipped.value.textContent = String(s.skipped + s.alreadyGone + s.forbidden);
      errors.value.textContent = String(s.errors);
    },
  };
};
```

- [ ] **Step 30.2: Commit**

```bash
git add src/content/ui/components/stats.ts
git commit -m "feat(ui): stats row with live aria-live updates"
```

---

### Task 31: Log box widget

**Files:**
- Create: `src/content/ui/components/log.ts`

- [ ] **Step 31.1: Create `src/content/ui/components/log.ts`**

```ts
import type { Logger } from '../../log/log.js';
import type { LogLine } from '../../../shared/types.js';
import { h } from '../h.js';

export type LogBoxApi = { el: HTMLElement };

const fmtTs = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour12: false });
};

export const renderLogBox = (logger: Logger): LogBoxApi => {
  const list = h('div', { role: 'log', 'aria-live': 'polite' });
  const newPill = h('button', { className: 'log-newpill', type: 'button', style: { display: 'none' } }, '↓ new');
  const wrap = h('div', { className: 'log-box' }, [list, newPill]);

  const renderLine = (l: LogLine) => {
    const line = h('div', { className: 'log-line' }, [
      h('span', { className: 'ts' }, fmtTs(l.ts)),
      l.msg,
    ]);
    list.appendChild(line);
  };

  let userScrolled = false;
  wrap.addEventListener('scroll', () => {
    const atBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 4;
    userScrolled = !atBottom;
    newPill.style.display = userScrolled ? 'inline-flex' : 'none';
  });

  newPill.addEventListener('click', () => {
    wrap.scrollTop = wrap.scrollHeight;
    userScrolled = false;
    newPill.style.display = 'none';
  });

  for (const line of logger.lines()) renderLine(line);
  logger.subscribe((line) => {
    renderLine(line);
    if (!userScrolled) wrap.scrollTop = wrap.scrollHeight;
  });

  return { el: wrap };
};
```

- [ ] **Step 31.2: Commit**

```bash
git add src/content/ui/components/log.ts
git commit -m "feat(ui): log box widget with autoscroll + new-line pill"
```

---

### Task 32: Primary button (Start / Cancel state)

**Files:**
- Create: `src/content/ui/components/primaryBtn.ts`

- [ ] **Step 32.1: Create `src/content/ui/components/primaryBtn.ts`**

```ts
import { h } from '../h.js';

export type PrimaryButtonState =
  | { kind: 'loading'; label: string }
  | { kind: 'idle'; label: string; onClick: () => void }
  | { kind: 'running'; label: string; onClick: () => void }
  | { kind: 'cancelling'; label: string };

export type PrimaryButtonApi = {
  el: HTMLElement;
  set(state: PrimaryButtonState): void;
};

export const renderPrimaryButton = (): PrimaryButtonApi => {
  const btn = h('button', { type: 'button', className: 'btn-primary' }) as HTMLButtonElement;

  const apply = (state: PrimaryButtonState): void => {
    btn.replaceChildren();
    btn.disabled = false;
    btn.onclick = null;

    switch (state.kind) {
      case 'loading':
        btn.disabled = true;
        btn.className = 'btn-primary';
        btn.textContent = state.label;
        return;
      case 'idle':
        btn.className = 'btn-primary';
        btn.textContent = state.label;
        btn.onclick = state.onClick;
        return;
      case 'running':
        btn.className = 'btn-cancel';
        btn.appendChild(h('span', { className: 'spinner' }));
        btn.appendChild(document.createTextNode(state.label));
        btn.onclick = state.onClick;
        return;
      case 'cancelling':
        btn.disabled = true;
        btn.className = 'btn-cancel';
        btn.appendChild(h('span', { className: 'spinner' }));
        btn.appendChild(document.createTextNode(state.label));
        return;
    }
  };

  return { el: btn, set: apply };
};
```

- [ ] **Step 32.2: Commit**

```bash
git add src/content/ui/components/primaryBtn.ts
git commit -m "feat(ui): primary button with idle/running/cancelling states"
```

---

## Phase J — Panel assembly + state machine

### Task 33: Panel composition

**Files:**
- Create: `src/content/ui/panel.ts`

- [ ] **Step 33.1: Create `src/content/ui/panel.ts`**

```ts
// eslint-disable-next-line import/no-unresolved -- bundled via sass-inline plugin
import css from './styles.scss';

import { STORAGE_KEYS } from '../../shared/constants.js';
import type { Boundary, PanelState, RunStats } from '../../shared/types.js';
import { renderHeader } from './components/header.js';
import { renderSection } from './components/section.js';
import { renderTarget } from './components/target.js';
import { renderBoundary } from './components/boundary.js';
import { renderStats } from './components/stats.js';
import { renderLogBox } from './components/log.js';
import { renderPrimaryButton } from './components/primaryBtn.js';
import type { Logger } from '../log/log.js';
import { installDrag, type Position } from './drag.js';
import { watchTheme } from './theme.js';
import { h } from './h.js';

export type PanelApi = {
  setState(s: PanelState): void;
  setStats(s: RunStats): void;
  setChannel(channel: import('../api/types.js').DiscordChannel | null): void;
  hide(): void;
  show(): void;
  destroy(): void;
  boundary(): Boundary;
  onStart(cb: () => void): void;
  onCancel(cb: () => void): void;
};

const sendBg = <T = unknown>(msg: unknown): Promise<T> =>
  new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (resp) => resolve(resp as T));
    } catch {
      resolve(undefined as T);
    }
  });

export const mountPanel = async (logger: Logger): Promise<PanelApi> => {
  const host = document.createElement('div');
  host.id = 'discord-purge-root';
  Object.assign(host.style, { all: 'initial', position: 'fixed', zIndex: '2147483000' });
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = css;
  shadow.appendChild(style);

  const initialPos = await sendBg<{ ok: true; data: Position | null }>({ kind: 'panel:getPosition' });
  const initialCollapsed = await sendBg<{ ok: true; data: boolean }>({ kind: 'panel:getCollapsed' });

  let onStart: () => void = () => undefined;
  let onCancel: () => void = () => undefined;

  const panel = h('div', {
    className: 'panel',
    role: 'region',
    'aria-label': 'discord-purge',
    dataset: { collapsed: String(Boolean(initialCollapsed?.data)) },
  });
  const headerApi = renderHeader({
    initialCollapsed: Boolean(initialCollapsed?.data),
    onToggleCollapse: (c) => {
      panel.dataset['collapsed'] = String(c);
      void sendBg({ kind: 'panel:setCollapsed', collapsed: c });
    },
    onClose: () => {
      panel.style.display = 'none';
    },
  });

  const target = renderTarget();
  const boundary = renderBoundary();
  const stats = renderStats();
  const logBox = renderLogBox(logger);
  const primary = renderPrimaryButton();

  const body = h('div', { className: 'panel-body' }, [
    renderSection('Target', target.el),
    renderSection('Boundary', boundary.el),
    renderSection('Stats', stats.el),
    renderSection('Log', logBox.el),
    primary.el,
  ]);

  panel.appendChild(headerApi.el);
  panel.appendChild(body);
  shadow.appendChild(panel);

  // theme tracking
  const themeWatcher = watchTheme();
  const unsubscribeTheme = themeWatcher.subscribe((t) => panel.setAttribute('data-theme', t));

  // drag
  const uninstallDrag = installDrag({
    panel,
    handle: headerApi.el,
    initial: initialPos?.data ?? null,
    onChange: (p) => {
      void sendBg({ kind: 'panel:setPosition', x: p.x, y: p.y });
    },
    onReset: () => {
      void sendBg({ kind: 'panel:setPosition', x: -1, y: -1 });
    },
  });

  let state: PanelState = 'loading-auth';
  const applyState = (s: PanelState) => {
    state = s;
    switch (s) {
      case 'loading-auth': primary.set({ kind: 'loading', label: 'Waiting for Discord…' }); break;
      case 'ready':       primary.set({ kind: 'idle', label: 'Start', onClick: () => onStart() }); break;
      case 'running':     primary.set({ kind: 'running', label: 'Cancel', onClick: () => onCancel() }); break;
      case 'cancelling':  primary.set({ kind: 'cancelling', label: 'Cancelling…' }); break;
      case 'done':        primary.set({ kind: 'idle', label: 'Run again', onClick: () => onStart() }); break;
      case 'error':       primary.set({ kind: 'idle', label: 'Try again', onClick: () => onStart() }); break;
    }
  };
  applyState('loading-auth');

  return {
    setState: applyState,
    setStats: (s) => stats.update(s),
    setChannel: (c) => target.setChannel(c),
    hide() { panel.style.display = 'none'; },
    show() { panel.style.display = ''; },
    destroy() {
      unsubscribeTheme();
      themeWatcher.destroy();
      uninstallDrag();
      host.remove();
    },
    boundary: () => boundary.value(),
    onStart(cb) { onStart = cb; },
    onCancel(cb) { onCancel = cb; },
  };
};

void STORAGE_KEYS; // silence unused-import in case later refactor drops it
```

- [ ] **Step 33.2: Add a triple-slash module declaration for SCSS imports**

Create `src/content/ui/styles.d.ts`:

```ts
declare module '*.scss' {
  const css: string;
  export default css;
}
```

- [ ] **Step 33.3: Lint**

Run: `npm run lint`
Expected: passes.

- [ ] **Step 33.4: Commit**

```bash
git add src/content/ui/panel.ts src/content/ui/styles.d.ts
git commit -m "feat(ui): assemble Discord-native floating panel + state machine"
```

---

### Task 34: Content-script entry: wire everything together

**Files:**
- Modify: `src/content/index.ts`

- [ ] **Step 34.1: Replace `src/content/index.ts`**

```ts
import { createApiClient } from './api/client.js';
import { getAuth, onAuth } from './auth.js';
import { Logger } from './log/log.js';
import { runPurge } from './runner/runner.js';
import { mountPanel, type PanelApi } from './ui/panel.js';
import { installNavListener, onLocationChange, readLocation } from './ui/nav.js';
import type { Boundary, RunStats } from '../shared/types.js';

const RUN_ID = crypto.randomUUID();
const logger = new Logger();

let panel: PanelApi | null = null;
let abort: AbortController | null = null;

const api = createApiClient({ getAuth, runId: RUN_ID });

const setupPanel = async () => {
  panel = await mountPanel(logger);
  panel.onStart(() => start());
  panel.onCancel(() => cancel());
  applyLocation();
};

const start = async () => {
  const loc = readLocation();
  if (!panel || !loc.isDm || !loc.channelId) return;
  if (!getAuth()?.authorization) {
    logger.append('cannot start: no auth captured yet');
    return;
  }

  const boundary: Boundary = panel.boundary();
  abort = new AbortController();
  panel.setState('running');
  logger.append('run: starting');

  try {
    const stats: RunStats = await runPurge({
      channelId: loc.channelId,
      boundary,
      api,
      logger,
      signal: abort.signal,
      onStats: (s) => panel?.setStats(s),
    });
    panel.setStats(stats);
    panel.setState(abort.signal.aborted ? 'ready' : 'done');
    logger.append(
      `run: finished — scanned ${stats.scanned}, deleted ${stats.deleted}, errors ${stats.errors}`,
    );
  } catch (e) {
    logger.append(`run: error — ${(e as Error).message}`);
    panel?.setState('error');
  } finally {
    abort = null;
  }
};

const cancel = () => {
  if (!abort) return;
  panel?.setState('cancelling');
  logger.append('run: cancellation requested');
  abort.abort();
};

const applyLocation = async () => {
  if (!panel) return;
  const loc = readLocation();
  if (!loc.isDm || !loc.channelId) {
    panel.hide();
    if (abort) cancel();
    return;
  }
  panel.show();
  await panel['setChannel' as keyof PanelApi](null as never); // reset display
  await (await import('./ui/components/target.js')); // ensure tree-shake doesn't drop module
  // Resolve channel info (uses captured auth if available)
  if (getAuth()?.authorization) {
    try {
      const c = await api.getChannel(loc.channelId);
      panel.setChannel(c);
    } catch (e) {
      logger.append(`channel info unavailable: ${(e as Error).message}`);
    }
  }
  if (getAuth()?.authorization) panel.setState('ready');
};

const main = async () => {
  installNavListener();
  await setupPanel();

  onAuth(() => {
    if (panel && !abort) {
      void applyLocation();
      // promote loading-auth -> ready
      panel.setState('ready');
    }
  });

  onLocationChange(() => {
    if (abort) cancel();
    void applyLocation();
  });
};

void main();
```

> **Note for the implementer:** the line `await panel['setChannel' as keyof PanelApi](null as never)` looks awkward — replace it with `panel.setChannel(null)`. The `await import(...)` for components is also unnecessary; remove it. (Both leftover from an earlier draft. Final code should be just two lines: `panel.show(); panel.setChannel(null);`.)

Final corrected snippet for `applyLocation()`:

```ts
const applyLocation = async () => {
  if (!panel) return;
  const loc = readLocation();
  if (!loc.isDm || !loc.channelId) {
    panel.hide();
    if (abort) cancel();
    return;
  }
  panel.show();
  panel.setChannel(null);
  if (getAuth()?.authorization) {
    try {
      const c = await api.getChannel(loc.channelId);
      panel.setChannel(c);
      panel.setState('ready');
    } catch (e) {
      logger.append(`channel info unavailable: ${(e as Error).message}`);
    }
  }
};
```

- [ ] **Step 34.2: Lint**

Run: `npm run lint`
Expected: passes.

- [ ] **Step 34.3: Build, reload, verify (manual)**

1. `npm run build:chrome`, reload extension.
2. Open a DM at `https://discord.com/channels/@me/<id>`.
3. Within ~3 s the panel appears bottom-right, transitions to "Start" state, with the channel name resolved.
4. Toggle Discord theme (User Settings → Appearance → Dark/Light): panel theme tracks instantly.
5. Drag panel by header: position survives reload.
6. Switch to a non-DM page (any server channel): panel hides.
7. Switch to a different DM: panel re-resolves and re-enables Start.

- [ ] **Step 34.4: Commit**

```bash
git add src/content/index.ts
git commit -m "feat(content): wire panel, runner, auth, navigation in entry script"
```

---

### Task 35: First end-to-end smoke test on a low-stakes DM

> Manual milestone — no code changes. Spend 5 minutes here before continuing.

- [ ] **Step 35.1: Pick a DM thread you don't mind purging.**

Suggested: a one-off DM with a test alt account, or any DM with messages you genuinely want gone.

- [ ] **Step 35.2: With "Boundary = None", start a run.**

Watch the panel: counters increment, log shows DELETE outcomes, no UI freezes.

- [ ] **Step 35.3: Force a 429 manually**

Run a second purge (or a parallel `for` loop in the page console hitting `DELETE`) to trigger Discord rate limiting. Confirm the panel logs `rate-limited; sleeping <N> ms` and resumes after the wait.

- [ ] **Step 35.4: Cancel mid-run, then run again**

Click Cancel during deletion. Verify the run stops within one DELETE cycle. Press "Run again" — confirm it resumes from the (now older) head of remaining messages.

- [ ] **Step 35.5: Set a datetime boundary to a recent value**

Send a fresh test message. Set Boundary = Datetime to a value ~1 minute in the future of that message. Run. Confirm only older messages are deleted; the recent one remains.

- [ ] **Step 35.6: Set a message-ID boundary**

Right-click a target message in Discord → Copy Message ID. Paste into Boundary = Message ID. Run. Confirm only messages with snowflake `<` that ID get deleted.

- [ ] **Step 35.7: If anything misbehaves, file a TODO note in `docs/manual-qa.md` and fix before continuing.**

(Document any fix in a small follow-up commit.)

---

## Phase K — Iconography

### Task 36: Source SVGs

**Files:**
- Create: `assets/icons/source.svg`
- Create: `assets/icons/source-mono.svg`

- [ ] **Step 36.1: Create `assets/icons/source.svg` (color icon, 1024×1024)**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <clipPath id="squircle">
      <path d="M512 16
        C 752 16, 1008 272, 1008 512
        C 1008 752, 752 1008, 512 1008
        C 272 1008, 16 752, 16 512
        C 16 272, 272 16, 512 16 Z" />
    </clipPath>
  </defs>
  <rect width="1024" height="1024" rx="220" ry="220" fill="#5865F2" />
  <g transform="translate(192,256)" fill="none" stroke="#FFFFFF" stroke-width="36" stroke-linejoin="round">
    <path d="M40 80
      Q 40 16, 104 16
      H 536
      Q 600 16, 600 80
      V 360
      Q 600 424, 536 424
      H 232
      L 120 528
      V 424
      H 104
      Q 40 424, 40 360
      Z" />
  </g>
  <g transform="translate(192,256)" fill="#FFFFFF">
    <circle cx="216" cy="220" r="32" fill-opacity="1.0" />
    <circle cx="320" cy="220" r="32" fill-opacity="0.5" />
    <circle cx="424" cy="220" r="32" fill-opacity="0.15" />
  </g>
</svg>
```

- [ ] **Step 36.2: Create `assets/icons/source-mono.svg` (monochrome variant)**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <g transform="translate(192,256)" fill="none" stroke="#FFFFFF" stroke-width="36" stroke-linejoin="round">
    <path d="M40 80
      Q 40 16, 104 16
      H 536
      Q 600 16, 600 80
      V 360
      Q 600 424, 536 424
      H 232
      L 120 528
      V 424
      H 104
      Q 40 424, 40 360
      Z" />
  </g>
  <g transform="translate(192,256)" fill="#FFFFFF">
    <circle cx="216" cy="220" r="32" fill-opacity="1.0" />
    <circle cx="320" cy="220" r="32" fill-opacity="0.5" />
    <circle cx="424" cy="220" r="32" fill-opacity="0.15" />
  </g>
</svg>
```

- [ ] **Step 36.3: Commit**

```bash
git add assets/icons/source.svg assets/icons/source-mono.svg
git commit -m "design: add color + monochrome logo SVGs (blurple squircle, fading dots)"
```

---

### Task 37: Icon raster generator

**Files:**
- Create: `scripts/gen-icons.ts`

- [ ] **Step 37.1: Create `scripts/gen-icons.ts`**

```ts
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = resolve(ROOT, 'assets/icons/source.svg');
const SRC_MONO = resolve(ROOT, 'assets/icons/source-mono.svg');
const OUT = resolve(ROOT, 'assets/icons');

const SIZES = [16, 32, 48, 128, 192, 512];

async function rasterize(svgPath: string, prefix: string) {
  const svg = await readFile(svgPath);
  for (const size of SIZES) {
    const buf = await sharp(svg, { density: 384 })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toBuffer();
    const outFile = resolve(OUT, `${prefix}-${size}.png`);
    await sharp(buf).toFile(outFile);
    console.log(`wrote ${outFile}`);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await rasterize(SRC, 'icon');
  await rasterize(SRC_MONO, 'icon-mono');

  // .ico = 16+32+48 multi-resolution
  const buffers = await Promise.all(
    [16, 32, 48].map(async (s) =>
      sharp(await readFile(SRC), { density: 384 }).resize(s, s).png().toBuffer(),
    ),
  );
  // Use sharp's joinChannel/ico? sharp doesn't write ICO natively. Fall back to writing
  // the 32px PNG renamed to .ico — Chrome and Firefox accept PNG bytes inside an .ico
  // container only with proper ICO header. Easiest: write a small PNG-favicon.
  await sharp(buffers[1]!).toFile(resolve(OUT, 'favicon.ico'));
  console.log('wrote favicon.ico (PNG-encoded)');

  void buffers; // silence
}

main().catch((e) => { console.error(e); process.exit(1); });
```

> **Note:** sharp does not produce a true multi-resolution .ico. The 32×32 PNG written as `favicon.ico` is accepted by Chrome and Firefox as a fallback. If you want a strict ICO, wire in `to-ico` (`npm i -D to-ico`) and switch the .ico writer to use it. Acceptable for v1.

- [ ] **Step 37.2: Generate icons**

Run: `npm run icons`
Expected: writes `assets/icons/icon-{16,32,48,128,192,512}.png`, `icon-mono-*.png`, and `favicon.ico`.

- [ ] **Step 37.3: Commit**

```bash
git add scripts/gen-icons.ts assets/icons/*.png assets/icons/favicon.ico
git commit -m "build: add SVG -> PNG/ICO icon rasterizer (sharp)"
```

---

## Phase L — Firefox build

### Task 38: Firefox manifest

**Files:**
- Create: `manifest/manifest.firefox.json`

- [ ] **Step 38.1: Create `manifest/manifest.firefox.json`**

```json
{
  "manifest_version": 3,
  "name": "discord-purge",
  "version": "0.0.0",
  "description": "Bulk-unsend your own messages from Discord DMs.",
  "browser_specific_settings": {
    "gecko": { "id": "discord-purge@dustfeather", "strict_min_version": "128.0" }
  },
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["https://discord.com/*"],
  "background": {
    "scripts": ["background.js"]
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["https://discord.com/channels/@me/*"],
      "js": ["auth-sniffer.js"],
      "run_at": "document_start",
      "world": "MAIN"
    },
    {
      "matches": ["https://discord.com/channels/@me/*"],
      "js": ["content.js"],
      "run_at": "document_idle",
      "world": "ISOLATED"
    }
  ],
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "web_accessible_resources": [
    {
      "resources": ["auth-sniffer.js"],
      "matches": ["https://discord.com/*"]
    }
  ]
}
```

- [ ] **Step 38.2: Build firefox target**

Run: `npm run build:firefox`
Expected: `dist/firefox/{manifest.json, content.js, auth-sniffer.js, background.js, popup.html, popup.js, popup.css, icons/...}` exist.

- [ ] **Step 38.3: Manual smoke in Firefox**

1. Open `about:debugging` → "This Firefox" → "Load Temporary Add-on…" → pick `dist/firefox/manifest.json`.
2. Open `https://discord.com/channels/@me/<id>`.
3. Confirm panel appears, theme tracks Discord, deletes work.

- [ ] **Step 38.4: Commit**

```bash
git add manifest/manifest.firefox.json
git commit -m "build(firefox): add MV3 manifest with gecko id and modern world:MAIN"
```

---

### Task 39: Firefox legacy fallback (no `world:MAIN`)

**Files:**
- Modify: `src/content/index.ts` (top of file — conditional injector)
- Modify: `scripts/build.ts` (handle `--firefox-legacy` by emitting different manifest content)

> **Why:** Firefox <128 doesn't support manifest-declared MAIN-world content scripts. The fallback is to inject `auth-sniffer.js` into the page from the ISOLATED script via a runtime `<script>` tag.

- [ ] **Step 39.1: Add a top-of-file injector to `src/content/index.ts`**

Insert this block at the very top of `src/content/index.ts`, before any other imports:

```ts
declare const __FIREFOX_LEGACY__: boolean;

if (typeof __FIREFOX_LEGACY__ !== 'undefined' && __FIREFOX_LEGACY__) {
  const url = (chrome as typeof chrome & { runtime: { getURL(p: string): string } })
    .runtime.getURL('auth-sniffer.js');
  const s = document.createElement('script');
  s.src = url;
  s.async = false;
  (document.head ?? document.documentElement).appendChild(s);
  s.remove();
}
```

- [ ] **Step 39.2: Modify `scripts/build.ts` so `--firefox-legacy` strips the MAIN-world entry from the firefox manifest**

In `copyManifest()`, after `manifest.version = VERSION;` add:

```ts
if (target === 'firefox' && firefoxLegacy) {
  manifest.content_scripts = manifest.content_scripts.filter(
    (cs: { world?: string }) => cs.world !== 'MAIN',
  );
  // strip world:MAIN from any remaining (defensive)
  for (const cs of manifest.content_scripts) delete cs.world;
}
```

- [ ] **Step 39.3: Build firefox-legacy and verify**

Run: `npx tsx scripts/build.ts --target=firefox --firefox-legacy`
Expected: `dist/firefox/manifest.json` no longer has the MAIN entry; the runtime-injected sniffer still emits the auth event in older Firefox.

(You may not have access to an old Firefox. Smoke-test in current Firefox by temporarily removing `"world": "MAIN"` from the modern build to confirm the runtime-injection path also works.)

- [ ] **Step 39.4: Commit**

```bash
git add src/content/index.ts scripts/build.ts
git commit -m "build(firefox): add --firefox-legacy fallback (runtime <script> injection)"
```

---

## Phase M — Tampermonkey build

### Task 40: Userscript build target & Tampermonkey shim

**Files:**
- Modify: `src/content/index.ts` (skip MAIN-world bridge under `__USERSCRIPT__`)
- Modify: `src/background/service-worker.ts` (no-op when not in extension)
- Already implemented: `scripts/build.ts buildUserscript()` (Task 8)

- [ ] **Step 40.1: Add a userscript-aware top-of-file in `src/content/index.ts`**

Insert before the existing `installNavListener()` and friends:

```ts
declare const __USERSCRIPT__: boolean;

if (typeof __USERSCRIPT__ !== 'undefined' && __USERSCRIPT__) {
  // Userscript runs in MAIN world: include the auth sniffer logic inline.
  // Re-import side-effect-only.
  await import('../injected/auth-sniffer.js');
}
```

> **Note:** in `__USERSCRIPT__` builds, `chrome.runtime` and `chrome.storage` do not exist. The panel's `sendBg` already handles the failure path by resolving `undefined`. Persistence is best-effort and silently no-ops in userscript mode.

- [ ] **Step 40.2: Build userscript**

Run: `npm run build:userscript`
Expected: `dist/discord-purge.user.js` exists with a Tampermonkey header and full IIFE body.

- [ ] **Step 40.3: Manual smoke (Tampermonkey)**

1. Open Tampermonkey dashboard → Utilities → "Import from file" → pick `dist/discord-purge.user.js`.
2. Visit `https://discord.com/channels/@me/<id>`.
3. Confirm: panel appears (no popup, no toolbar icon — userscript-mode), auth captures, deletes work.

- [ ] **Step 40.4: Commit**

```bash
git add src/content/index.ts
git commit -m "build(userscript): add Tampermonkey-aware MAIN-world inline import"
```

---

## Phase N — Packaging scripts

### Task 41: Zip + xpi packers

**Files:**
- Create: `scripts/pack-zip.ts`
- Create: `scripts/pack-xpi.ts`

- [ ] **Step 41.1: Create `scripts/pack-zip.ts`**

```ts
import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = resolve(ROOT, 'dist/chrome');
const OUT = resolve(ROOT, 'dist/chrome.zip');

async function main() {
  await mkdir(resolve(ROOT, 'dist'), { recursive: true });
  const out = createWriteStream(OUT);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(out);
  archive.directory(SRC, false);
  await archive.finalize();
  console.log(`wrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 41.2: Create `scripts/pack-xpi.ts`**

```ts
import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = resolve(ROOT, 'dist/firefox');
const OUT = resolve(ROOT, 'dist/firefox.xpi');

async function main() {
  await mkdir(resolve(ROOT, 'dist'), { recursive: true });
  const out = createWriteStream(OUT);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(out);
  archive.directory(SRC, false);
  await archive.finalize();
  console.log(`wrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 41.3: pack-userscript.ts is trivial — userscript build writes directly to `dist/discord-purge.user.js`. Create a stub that just re-runs the build.**

Create `scripts/pack-userscript.ts`:

```ts
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const r = spawnSync('npx', ['tsx', 'scripts/build.ts', '--target=userscript'], {
  cwd: ROOT,
  stdio: 'inherit',
});
process.exit(r.status ?? 0);
```

- [ ] **Step 41.4: Run the full pack pipeline**

Run: `npm run pack`
Expected: `dist/chrome.zip`, `dist/firefox.xpi`, `dist/discord-purge.user.js` exist.

- [ ] **Step 41.5: Commit**

```bash
git add scripts/pack-zip.ts scripts/pack-xpi.ts scripts/pack-userscript.ts
git commit -m "build: add zip/xpi/userscript packers"
```

---

## Phase O — CI / CD

### Task 42: PR + push CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 42.1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run icons
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: discord-purge-dev-build
          path: |
            dist/chrome/
            dist/firefox/
            dist/discord-purge.user.js
          retention-days: 7
```

- [ ] **Step 42.2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: lint + typecheck + build on PR and push to main"
```

---

### Task 43: Tag-push release packaging

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 43.1: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run icons
      - run: npm run pack
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            dist/chrome.zip
            dist/firefox.xpi
            dist/discord-purge.user.js
          generate_release_notes: true
          fail_on_unmatched_files: true
```

- [ ] **Step 43.2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): tag-push -> packaged GitHub Release with chrome/firefox/userscript"
```

---

### Task 44: AMO + Chrome Web Store auto-publish (wired-but-disabled)

**Files:**
- Create: `.github/workflows/publish-amo.yml`
- Create: `.github/workflows/publish-cws.yml`

- [ ] **Step 44.1: Create `.github/workflows/publish-amo.yml`**

```yaml
name: Publish AMO

on:
  workflow_dispatch:
  release:
    types: [published]

permissions:
  contents: read

jobs:
  publish:
    if: ${{ vars.PUBLISH_AMO == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run icons
      - run: npm run build:firefox && npm run pack:firefox
      - name: Submit to AMO
        uses: kewisch/action-web-ext@v1
        with:
          cmd: sign
          source: dist/firefox.xpi
          channel: listed
          apiKey: ${{ secrets.AMO_API_KEY }}
          apiSecret: ${{ secrets.AMO_API_SECRET }}
          timeout: 900000
```

- [ ] **Step 44.2: Create `.github/workflows/publish-cws.yml`**

```yaml
name: Publish Chrome Web Store

on:
  workflow_dispatch:
  release:
    types: [published]

permissions:
  contents: read

jobs:
  publish:
    if: ${{ vars.PUBLISH_CWS == 'true' }}
    runs-on: ubuntu-latest
    env:
      CWS_EXT_ID: ${{ vars.CWS_EXTENSION_ID }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run icons
      - run: npm run build:chrome && npm run pack:chrome
      - name: Get access token
        id: token
        run: |
          set -euo pipefail
          TOKEN=$(curl -fsS -X POST -d \
            "client_id=${{ secrets.CWS_CLIENT_ID }}" \
            -d "client_secret=${{ secrets.CWS_CLIENT_SECRET }}" \
            -d "refresh_token=${{ secrets.CWS_REFRESH_TOKEN }}" \
            -d "grant_type=refresh_token" \
            https://oauth2.googleapis.com/token | jq -r .access_token)
          echo "::add-mask::$TOKEN"
          echo "token=$TOKEN" >> "$GITHUB_OUTPUT"
      - name: Upload zip
        run: |
          set -euo pipefail
          curl -fsS \
            -H "Authorization: Bearer ${{ steps.token.outputs.token }}" \
            -H "x-goog-api-version: 2" \
            -X PUT -T dist/chrome.zip \
            "https://www.googleapis.com/upload/chromewebstore/v1.1/items/${CWS_EXT_ID}"
      - name: Publish
        run: |
          set -euo pipefail
          curl -fsS \
            -H "Authorization: Bearer ${{ steps.token.outputs.token }}" \
            -H "x-goog-api-version: 2" \
            -H "Content-Length: 0" \
            -X POST \
            "https://www.googleapis.com/chromewebstore/v1.1/items/${CWS_EXT_ID}/publish"
```

- [ ] **Step 44.3: Document the gates in the README (added in Task 47).**

Both workflows are gated on repo variables (`vars.PUBLISH_AMO`, `vars.PUBLISH_CWS`) — neither runs unless the repo owner explicitly sets the variable to `'true'` in GitHub repo settings. Required secrets: `AMO_API_KEY`, `AMO_API_SECRET`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`. Required variable: `CWS_EXTENSION_ID`.

- [ ] **Step 44.4: Commit**

```bash
git add .github/workflows/publish-amo.yml .github/workflows/publish-cws.yml
git commit -m "ci(publish): wire AMO + Chrome Web Store auto-publish (gated by repo vars)"
```

---

## Phase P — Documentation

### Task 45: Manual QA checklist

**Files:**
- Create: `docs/manual-qa.md`

- [ ] **Step 45.1: Create `docs/manual-qa.md`**

```markdown
# Manual QA checklist

Every release run-through covers the items below. Tick each box during pre-release smoke testing.

## Setup
- [ ] Install unpacked from `dist/chrome` in Chrome.
- [ ] Install `dist/firefox.xpi` in Firefox via `about:debugging`.
- [ ] Install `dist/discord-purge.user.js` via Tampermonkey (Chrome + Firefox).

## Auth capture
- [ ] Open `discord.com/channels/@me/<id>` (1:1). Within ~3 s, panel transitions from `loading-auth` → `ready`.
- [ ] Same for a group DM URL.
- [ ] Reload mid-session: capture re-fires.

## UI
- [ ] Panel renders bottom-right, 8px rounded, opaque, visually consistent with Discord modal styling.
- [ ] Toggle Discord theme (User Settings → Appearance) dark↔light: panel updates immediately.
- [ ] Collapse / expand persists across reloads.
- [ ] On non-DM page: panel hidden; toolbar popup shows redirect message.
- [ ] SPA-navigate to a different DM mid-run: in-flight run aborts; panel resets.
- [ ] `prefers-reduced-motion: reduce` (browser/OS): animations disabled.
- [ ] Drag panel: position persists across reloads.
- [ ] Drag panel partially off-screen, resize window: panel snaps back in-bounds.
- [ ] Double-click header: panel returns to default bottom-right anchor.

## Boundary semantics
- [ ] None: deletes every authored message in the thread.
- [ ] Datetime: pick a value between two known messages; only messages older than that timestamp get deleted.
- [ ] Message ID: paste an ID; only messages with snowflake `<` that ID get deleted.
- [ ] Pinned message: never deleted.

## Rate limiting & errors
- [ ] Force a 429 (run two extensions side-by-side or a fast burst): panel logs back-off and resumes.
- [ ] Disconnect network mid-run: errors logged, run aborts gracefully, no crash.

## Cancellation
- [ ] Click Cancel while running: stops within one in-flight DELETE; counters reflect partial progress.
- [ ] Close tab mid-run: no orphaned background activity (background SW idle in `chrome://serviceworker-internals`).

## Cross-browser
- [ ] Full pass on Chrome stable.
- [ ] Full pass on Firefox stable.
- [ ] Smoke pass on Tampermonkey (Chrome + Firefox).
```

- [ ] **Step 45.2: Commit**

```bash
git add docs/manual-qa.md
git commit -m "docs: add manual QA checklist (release smoke-test list)"
```

---

### Task 46: Expanded README

**Files:**
- Modify: `README.md`

- [ ] **Step 46.1: Replace `README.md` with the full version**

```markdown
# discord-purge

Bulk-unsend your own messages from Discord 1:1 and group direct-message threads, from a floating panel that visually blends with Discord's own UI.

![chat-bubble icon, blurple squircle](./assets/icons/icon-128.png)

## Features

- Floating panel auto-opens on `https://discord.com/channels/@me/*` (1:1 and group DMs).
- One optional **boundary** filter: delete only messages older than a chosen datetime, *or* older than a chosen message ID.
- Pinned messages are always skipped.
- Discord rate limits (HTTP 429) are handled automatically with back-off.
- Drag the panel anywhere in the viewport; double-click header to reset.
- Theme follows Discord's own dark/light setting in real time.
- Ships as Chrome MV3, Firefox MV3, and a Tampermonkey userscript from a single TypeScript codebase.

## Install

- **Chrome / Edge:** download `chrome.zip` from the [latest release](https://github.com/dustfeather/discord-purge/releases/latest), unzip, then in `chrome://extensions` enable "Developer mode" and click "Load unpacked".
- **Firefox:** download `firefox.xpi` from the latest release and install via `about:debugging` → "Load Temporary Add-on…", or from the AMO listing if available.
- **Tampermonkey:** install `discord-purge.user.js` from the latest release.

## How to use

1. Open any Discord DM (`discord.com/channels/@me/<id>`).
2. The panel appears bottom-right within ~3 s once Discord makes its first API call.
3. *(Optional)* set a boundary — Datetime or Message ID. Without a boundary, every message you authored in this thread will be deleted.
4. Click **Start**. The runner walks history newest-to-oldest with a ~3.5 s spacing between deletes (jittered ±30%) and respects Discord's 429 back-off.

## Use at your own risk

> Bulk-deleting messages can violate Discord's Terms of Service. The author of this project is not responsible for any account actions taken against you. Review Discord's Terms before use.

## Develop

```bash
npm install
npm run icons        # rasterize SVG -> PNG/ICO
npm run dev          # esbuild watch, Chrome target
# load dist/chrome unpacked in chrome://extensions
```

Other commands:
- `npm run build` — Chrome + Firefox + userscript outputs.
- `npm run pack` — Chrome zip, Firefox xpi, userscript file.
- `npm run lint` — ESLint + `tsc --noEmit`.

The full design is in `docs/superpowers/specs/2026-05-01-discord-purge-design.md`. Manual QA checklist in `docs/manual-qa.md`.

## CI / publishing

- **Every PR / push to `main`** runs lint + typecheck + build, uploads dev artifacts.
- **Tags `v*`** trigger a packaged GitHub Release.
- **AMO and Chrome Web Store auto-publish** are wired but disabled by default. Enable per repo:
  - Set repo variable `PUBLISH_AMO=true` and secrets `AMO_API_KEY`, `AMO_API_SECRET`.
  - Set repo variable `PUBLISH_CWS=true`, `CWS_EXTENSION_ID`, and secrets `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`.

## License

GPL-3.0-only. See [LICENSE](./LICENSE).
```

- [ ] **Step 46.2: Commit**

```bash
git add README.md
git commit -m "docs: expand README with usage, develop, CI/publishing details"
```

---

### Task 47: Final lint + build sanity, push

**Files:**
- (none — verification only)

- [ ] **Step 47.1: Final clean build**

```bash
rm -rf dist node_modules
npm ci
npm run lint
npm run icons
npm run build
npm run pack
```

Expected: all commands succeed; `dist/chrome.zip`, `dist/firefox.xpi`, `dist/discord-purge.user.js` exist.

- [ ] **Step 47.2: Manual full-pass against `docs/manual-qa.md`**

Tick every box in `docs/manual-qa.md` against a real DM. If anything fails, file a follow-up task and commit a fix before tagging.

- [ ] **Step 47.3: Tag and push**

```bash
git tag -a v0.1.0 -m "v0.1.0: initial release"
git push origin main
git push origin v0.1.0
```

The release workflow runs against the tag and creates a GitHub Release with the three artifacts.

- [ ] **Step 47.4: Commit any QA fix-up notes**

If §47.2 surfaced bugs, fix them in small follow-up commits *before* the tag push. Do not push the tag if the manual QA failed.

---

## Self-review (executed by plan author)

**1. Spec coverage**

| Spec section | Implemented in |
|---|---|
| §1 Summary | Plan header |
| §2 Goals | Tasks 11–34 (overall) |
| §3 Non-goals | Out of plan (deliberately) |
| §4 Architecture | Tasks 9–13, 20, 33–34 |
| §5 Auth-capture bridge | Tasks 11–12, 39–40 |
| §6 Discord API and deletion flow | Tasks 13–19 |
| §7.1–7.10 UI panel (Discord-native) | Tasks 22–34 |
| §7.11 Panel state machine | Task 33 |
| §7.12 Channel-info resolution | Task 28, 34 |
| §7.13 SPA navigation handling | Task 25, 34 |
| §7.14 Toolbar & popup | Task 21 |
| §7.15 No framework | Tasks 22–32 |
| §8.1–8.4 Tech stack, repo layout, build, scripts | Tasks 1–10, 22–23 |
| §8.5 Chrome manifest | Task 9 |
| §8.6 Firefox manifest deltas + legacy fallback | Tasks 38–39 |
| §8.7 Tampermonkey constraints | Task 40 |
| §8.8 CI / CD (PR + tag + wired-disabled publish) | Tasks 42–44 |
| §8.9 Code quality | Tasks 2, 3, 47 |
| §9 Logo / iconography | Tasks 36–37 |
| §10 Manual verification checklist | Tasks 35, 45, 47 |
| §11 Risks | Mitigations live in code (delays, backoff, abort) — not a separate task |
| §12 Disclaimer wording | Tasks 4, 46 (README) |
| §13 Glossary | Spec-only |

No spec section is missing implementation. All risks listed in §11 have corresponding mitigations in the code tasks (jittered delay → Task 16; 429 backoff → Tasks 16, 19; abort on nav → Tasks 25, 34; legacy-firefox fallback → Task 39; etc.).

**2. Placeholder scan**

- No "TBD", "TODO", "implement later".
- No "add appropriate error handling" without showing the handling.
- One inline note in Task 34 calling out a draft glitch and providing the corrected snippet — kept as guidance, not a TODO.
- Task 37's `.ico` is documented as a known fidelity compromise (PNG-encoded; a strict ICO is one optional dependency away). This is acceptable for v1 per spec §9.

**3. Type consistency**

Cross-checked symbol names across tasks:
- `AuthHeaders` (`shared/types.ts`) — used in `auth-sniffer.ts` (Task 11), `auth.ts` (Task 12), `client.ts` (Task 15). Consistent.
- `RunStats` — `runner.ts` (Task 19), `stats.ts` (Task 30), `panel.ts` (Task 33), `service-worker.ts` (Task 20). Consistent shape.
- `Boundary` — `types.ts` (Task 6), `filters.ts` (Task 17), `boundary.ts` (Task 29), `panel.ts` (Task 33), `index.ts` (Task 34). Discriminated union matches everywhere.
- `PanelState` — `types.ts` (Task 6), `panel.ts` (Task 33), `index.ts` (Task 34). All six states wired.
- `EVENT_AUTH` / `EVENT_LOCATION` — `constants.ts` (Task 5), `auth-sniffer.ts` (Task 11), `auth.ts` (Task 12), `nav.ts` (Task 25). Consistent.
- `ApiClient` interface — defined in Task 15, consumed in Tasks 19 and 28 with the exact method signatures.
- `Logger` API (`append`, `lines`, `subscribe`, `clear`) — defined in Task 18, consumed in Tasks 31, 34. Consistent.

No drift detected.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-01-discord-purge.md`. Per user direction, **execution should run in parallel waves wherever the parallelization plan above allows.**

**Recommended path: subagent-driven, wave-parallel execution.** The orchestrator (`superpowers:subagent-driven-development`) dispatches one fresh subagent per task within a wave, all running concurrently. Each agent commits its own task. The orchestrator waits for all subagents in a wave to land their commits, runs `npm run lint` once as a safety net, then advances to the next wave. Manual gate waves (W9, W13) pause for human verification.

The single-threaded join points are:

- **W0** (install) — must complete before anything else.
- **W7** (panel assembly) — depends on every UI component.
- **W8** (content-script entry) — final wiring step.
- **W9** 👤 (manual smoke) — human-only gate.
- **W12** (README) — single doc.
- **W13** 👤 (release) — human-only gate.

Everything else parallelizes per the wave table.
