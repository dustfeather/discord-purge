# discord-purge — design spec

- **Date:** 2026-05-01
- **Status:** Draft (awaiting user review)
- **Owner:** dustfeather
- **License:** GPL-3.0-only

## 1. Summary

`discord-purge` is a browser extension (Chrome MV3 + Firefox MV3) and a Tampermonkey userscript that bulk-unsends the user's own messages from Discord direct-message threads — both 1:1 DMs and group DMs, all under `https://discord.com/channels/@me/*`. Server channels are out of scope.

Inspiration is `victornpb/undiscord` (the *what*) plus `dustfeather/uninsta` (the *how*: real WebExtension, content-script architecture, MAIN-world auth interception, floating panel, jittered serial deletes). The new project mirrors uninsta's filter UX (a single optional boundary — datetime *or* message ID). The panel is **styled to feel like a native Discord surface** — same color tokens, typography stack, radii, button styles, motion, and theme behavior — so it visually reads as a built-in Discord feature rather than a third-party overlay.

## 2. Goals

- Bulk-unsend my own messages from any 1:1 or group DM I have open.
- Optional boundary: delete only messages older than a chosen datetime, or older than a chosen message ID.
- Floating panel that visually blends with Discord's UI; theme follows Discord's own theme (dark/light), updating in real time as the user changes it in Discord settings.
- Robust to Discord rate limits (HTTP 429) with automatic backoff.
- Ship as Chrome MV3 zip, Firefox MV3 XPI, and a Tampermonkey userscript from a single TypeScript codebase.

## 3. Non-goals (v1)

- Server-channel deletion (covered by upstream undiscord).
- Multi-thread queueing — one DM at a time.
- Resumable runs across page reloads.
- Search-based discovery; we always walk channel history with `before=`.
- Pause/resume controls (Start + Cancel only).
- Dry-run / preview mode.
- Filtering by content text, attachments, links, or message type beyond the always-applied pinned/system filter.
- Including pinned messages.
- Localization (English only).
- Custom delay / jitter UI (tunable in source only).
- Telemetry of any kind.

## 4. Architecture

Three execution contexts, talking via two bridges:

```
┌─────────────────────── Discord page (discord.com) ───────────────────────┐
│                                                                          │
│  MAIN world                       │  ISOLATED world                       │
│  injected/auth-sniffer.ts         │  content/index.ts                     │
│   - wraps fetch + XHR             │   - mounts Shadow-DOM panel           │
│   - emits "discord-purge:auth"    │   - listens for auth events           │
│     CustomEvent with relevant     │   - drives DiscordClient + runner     │
│     headers                       │   - chrome.runtime <-> background     │
└───────────────────────────────────┴───────────────────────────────────────┘
                                          ▲
                                          │ chrome.runtime messages (storage only)
                                          ▼
                                ┌────────────────────┐
                                │  Background SW     │
                                │  - persists log    │
                                │  - persists prefs  │
                                │  - no API calls    │
                                └────────────────────┘
```

Key decisions:

- **All Discord API calls happen in the ISOLATED-world content script**, using the captured headers. The background SW does *not* call Discord (preserves origin/cookies, avoids host-permission DELETE oddities).
- **MAIN-world script is intentionally tiny** — only sniffs outbound headers and forwards them. No business logic.
- **Panel lives in a Shadow DOM** to fully isolate styles from Discord's own CSS.
- **Tampermonkey build collapses contexts** into a single MAIN-world userscript file at `document-start`; the cross-context bridge becomes a direct module call.

## 5. Auth-capture bridge

### 5.1 MAIN-world script (`src/injected/auth-sniffer.ts`)

Runs at `document_start`. Wraps `fetch` and `XMLHttpRequest`, captures relevant headers from outbound requests to `https://discord.com/api/*`, emits a `CustomEvent` named `discord-purge:auth` whose `detail.headers` is a snapshot of the latest seen values.

Captured headers include `Authorization` and any other Discord-client headers needed to make API requests pass server-side validation (e.g. `X-Super-Properties`, `X-Discord-Locale`, `X-Discord-Timezone`, `X-Debug-Options`). The relevant set is centralized in one constant for easy maintenance.

Re-emission is debounced by stringified-snapshot equality so identical events are not re-fired; new emissions fire whenever any captured header changes (e.g. user switches accounts).

### 5.2 ISOLATED-world receiver (`src/content/auth.ts`)

Listens for `discord-purge:auth`, stores latest snapshot in module-private state, exposes `getAuth()` and an `onAuth(handler)` subscription used by the panel state machine to flip from `loading-auth` → `ready`.

### 5.3 Manifest plumbing

- **Chrome MV3:** two `content_scripts` entries, both matching `https://discord.com/channels/@me/*`. The first declares `"world": "MAIN"` and `"run_at": "document_start"` for the sniffer. The second is ISOLATED, `"document_idle"`, for the panel + receiver.
- **Firefox MV3 (modern, ≥128):** identical manifest with `"world": "MAIN"` supported.
- **Firefox MV3 (legacy fallback):** build flag `--firefox-legacy` switches the sniffer to runtime injection — the ISOLATED script appends `<script src=browser.runtime.getURL('auth-sniffer.js')>` to `document.documentElement`. Requires `auth-sniffer.js` in `web_accessible_resources`. Default build assumes modern Firefox.
- **Tampermonkey:** single userscript at `// @run-at document-start` in the page world; the bridge is a direct shared-module call.

### 5.4 Notable constraint

Chrome MV3 MAIN-world content scripts cannot use `chrome.runtime.onMessage`. The MAIN sniffer never needs to; it only emits `CustomEvent`s. All `chrome.runtime` traffic is owned by the ISOLATED sibling.

### 5.5 What we deliberately do not capture

Request bodies, cookies, response payloads. Only outbound request headers, only the listed set, only on `*/api/*` URLs.

## 6. Discord API and deletion flow

### 6.1 Endpoints used (only these three)

| Purpose | Method + Path |
|---|---|
| Identify the user | `GET /api/v9/users/@me` (returns our `id`) |
| List messages in the open DM | `GET /api/v9/channels/{channel_id}/messages?limit=100&before={msg_id}` |
| Delete one message | `DELETE /api/v9/channels/{channel_id}/messages/{message_id}` |

The Discord *search* endpoint is deliberately avoided in DMs (indexing-lag, occasional `202 Indexing`, behaves differently in DMs vs guilds).

`API_VERSION` is a single constant in `src/shared/constants.ts` so a future `v9 → v10` flip is a one-line change.

### 6.2 Channel ID source

Read from the URL — `/channels/@me/{channel_id}`. Re-read on SPA navigation so switching threads updates the target without reload (see §8.5).

### 6.3 Boundary unification

User picks one of:
- `none` — default
- `datetime` — `<input type="datetime-local">` with minute precision
- `messageId` — 18–20 digit text input

Internally, both `datetime` and `messageId` collapse into a single `BigInt` `maxSnowflake`:

- datetime → `BigInt(date_ms - DISCORD_EPOCH) << 22n`
- messageId → `BigInt(messageId)`

`DISCORD_EPOCH = 1420070400000` (2015-01-01T00:00:00Z).

### 6.4 Per-message filter (always applied)

```
candidate(m) ⇔
  m.author.id === self.id
  ∧ m.pinned === false
  ∧ m.type ∈ {0, 19, 20}        // default, reply, slash-command reply
  ∧ (boundary == null ∨ BigInt(m.id) < boundary)
```

Excluding pinned matches uninsta's default. Excluding non-default `type` skips system entries that the user couldn't delete anyway.

### 6.5 Main loop

Walks history newest-to-oldest with `before={cursor}`, page size 100, until an empty page is returned or run is aborted.

```ts
async function purge(channelId: string, ctx: RunContext) {
  const me = await api.getMe();
  let cursor: string | undefined;
  while (!ctx.aborted) {
    const page = await api.listMessages(channelId, { limit: 100, before: cursor });
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;

    const targets = page.filter(m => candidate(m, me, ctx.boundary));
    ctx.stats.scanned += page.length;

    for (const m of targets) {
      if (ctx.aborted) return;
      await deleteOne(channelId, m.id, ctx);
    }
  }
}
```

### 6.6 `deleteOne` — delay, retry, error mapping

```ts
async function deleteOne(chId: string, msgId: string, ctx: RunContext) {
  await jitteredSleep(ctx.config.baseDelayMs);   // 3500ms ± 30%
  for (let attempt = 0; attempt < ctx.config.maxAttempts; attempt++) {
    const res = await api.deleteMessage(chId, msgId);
    if (res.status === 204) { ctx.stats.deleted++; return; }
    if (res.status === 404) { ctx.stats.alreadyGone++; return; }
    if (res.status === 403) { ctx.stats.forbidden++; return; }
    if (res.status === 429) {
      const wait = Math.max(readRetryAfter(res), 5000);
      ctx.log(`rate-limited, sleeping ${wait}ms`);
      await sleep(wait);
      continue;
    }
    if (res.status >= 500) { await sleep(backoff(attempt)); continue; }
    ctx.stats.errors++;
    ctx.log(`unexpected ${res.status} for ${msgId}`);
    return;
  }
  ctx.stats.errors++;
}
```

Constants: `baseDelayMs = 3500`, jitter = ±30%, `maxAttempts = 5`, exponential backoff `min(30000, 1000 * 2^attempt)`.

### 6.7 Outbound headers

All captured headers from §5 are replayed verbatim on every outbound request, plus a single diagnostic header `X-Discord-Purge-Run: <run-id>` (random UUID per run) for DevTools traceability. `Authorization` is the captured value, exactly as Discord's own client sent it.

### 6.8 Concurrency

Strictly serial. One DELETE at a time. Parallelism would only trigger more 429s without going faster.

### 6.9 Cancellation triggers

`RunContext.aborted` flips when:
- user clicks Cancel,
- channel ID in the URL changes mid-run (we never delete from a thread the user has navigated away from),
- the panel/tab is closed.

### 6.10 Persistence

Stats and the last 200 log lines stream to `chrome.storage.local` via the background SW. Logs survive reload. **Runs do not resume across reloads** — too risky.

## 7. UI / floating panel (Discord-native styling)

The panel is styled to feel like a built-in Discord surface — same color tokens, font stack, button shape, modal-card geometry, and motion language as Discord's own settings/modal UI. The panel still lives inside its own Shadow DOM (so Discord's CSS can't bleed in and ours can't bleed out), but the *visual language* is Discord's, applied through a small set of CSS variables that mirror Discord's design tokens.

### 7.1 Surface & shape

- **Opaque** card (no `backdrop-filter`). Discord's own modals are opaque rectangles with a subtle shadow; matching that.
- Background: `var(--bg-base)` — `#313338` in dark, `#FFFFFF` in light. (Same as Discord's "elevated" surface.)
- Inner section dividers: 1px solid `var(--separator)` — `#3F4147` (dark) / `#E3E5E8` (light).
- Corner radius: **8px on the panel itself**, **3px on buttons and inputs** (Discord's actual control radii).
- Drop shadow: `0 8px 16px rgba(0,0,0,0.24)` (matches Discord's modal shadow).
- Width 360px, max-height 520px. Default position: fixed bottom-right, 16px inset.

### 7.2 Typography

- Stack: `"gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif` — exact Discord stack. `gg sans` is proprietary and not bundled, but it's the first preference: when the page loads it on `discord.com`, the panel inherits it for free; otherwise the next fallback (`Noto Sans` / system) keeps the look consistent.
- Monospace stack: `Consolas, "Andale Mono WT", "Andale Mono", "Lucida Console", monospace` (Discord's `--font-code`).
- Sizes (matching Discord's scale): header 16/600, section title 12/700 uppercase 0.02em letter-spacing, body 14/400, secondary 12/400, log 12/400 monospace.

### 7.3 Color tokens (mirrors Discord's design tokens)

Names and values are taken from Discord's published CSS variables. Local CSS variables aliased so future Discord renames need only one swap.

| Local token (panel) | Maps to Discord variable | Dark default | Light default |
|---|---|---|---|
| `--bg-base` | `--background-base-lower` / `--bg-overlay-3` | `#313338` | `#FFFFFF` |
| `--bg-mod` | `--background-modifier-hover` | `rgba(78,80,88,0.16)` | `rgba(116,127,141,0.08)` |
| `--bg-input` | `--input-background` | `#1E1F22` | `#EBEDEF` |
| `--text-normal` | `--text-default` / `--text-normal` | `#DBDEE1` | `#2E3338` |
| `--text-muted` | `--text-muted` | `#949BA4` | `#5C5E66` |
| `--separator` | `--background-modifier-accent` | `#3F4147` | `#E3E5E8` |
| `--brand` | `--brand-experiment` (blurple) | `#5865F2` | `#5865F2` |
| `--brand-hover` | `--brand-experiment-560` | `#4752C4` | `#4752C4` |
| `--danger` | `--status-danger` / `--button-danger-background` | `#DA373C` | `#D83C3E` |
| `--danger-hover` | `--button-danger-background-hover` | `#A12828` | `#A12828` |
| `--success` | `--status-positive` / `--info-positive-foreground` | `#23A559` | `#1A7F37` |

### 7.4 Theme source

Theme follows **Discord's own theme**, not OS preference. Discord toggles a class on `<html>` (`theme-dark` or `theme-light`, plus `visual-refresh` on modern clients). A `MutationObserver` on `<html>`'s `class` attribute mirrors that into the shadow root via a `data-theme="dark|light"` attribute. CSS variables switch off `[data-theme]`. Theme changes Discord's settings → panel updates instantly, no reload.

### 7.5 Spacing scale

4 / 8 / 12 / 16 / 20 px (Discord uses an 8px-leaning scale; this set covers all our needs).

### 7.6 Layout (top → bottom)

```
┌──────────────────────────────────────────────┐
│ discord-purge                     [ — ] [ × ]│  <- header / drag handle
├──────────────────────────────────────────────┤
│ TARGET                                       │
│ DM with @lucia · 1081268290455879770         │
├──────────────────────────────────────────────┤
│ BOUNDARY                                     │
│ [ None | Datetime | Message ID ]             │  <- segmented control (Discord-style tabs)
│ [ 2025-01-15 14:30   📅 ]                     │  <- visible only when datetime selected
│ Only delete messages older than this.        │
├──────────────────────────────────────────────┤
│ STATS                                        │
│ Scanned 0   Deleted 0   Skipped 0   Errors 0 │
├──────────────────────────────────────────────┤
│ LOG                                          │
│ ┌────────────────────────────────────────┐   │
│ │ 14:01:02  waiting for auth…            │   │
│ │ 14:01:03  auth captured                │   │
│ │ 14:01:03  ready (channel resolved)     │   │
│ └────────────────────────────────────────┘   │
├──────────────────────────────────────────────┤
│ [          Start          ]                  │
└──────────────────────────────────────────────┘
```

Section labels (`TARGET`, `BOUNDARY`, etc.) follow Discord's settings-page convention: 12px / 700 / uppercase / `--text-muted`.

### 7.7 Controls

- **Header (40px)** — Discord-style: title left in `--text-normal`; trailing 24×24 ghost buttons: collapse (chevron-down SVG) and close (×). Hover background `--bg-mod` with 3px radius. Inline SVG paths styled with `currentColor`.
- **Boundary picker** — Discord's "tab bar" pattern (the same look as the channel-folder/category pills in Discord settings). Three options `None / Datetime / Message ID`. Selected tab sits on `--bg-mod`, 3px radius, with a 2px-tall blurple bottom-bar accent. Unselected tabs are flat. Switching tabs swaps the corresponding input below in 150ms.
- **`<input type="datetime-local">`** — `step="60"`, 32px height, 3px radius, background `--bg-input`, 1px border `--separator`, focus border `--brand`, no glowing halo (Discord doesn't use one).
- **Stat row** — single line, four pairs `Label N`, monospace numerals, label in `--text-muted`, value in `--text-normal`.
- **Log box** — 144px, monospace, 1px border `--separator`, background `--bg-input`, 3px radius, 8px padding. Autoscroll; when scrolled up, a small Discord-style "↓ new messages" pill appears top-right of the log box (white text on `--brand`, 14px tall, 9px radius pill).
- **Primary button** — Discord's default button: 38px height, full-width minus 16px padding, filled `--brand`, white label, 3px radius, 500 weight. Hover `--brand-hover`. Active darkens slightly. Disabled at 40% opacity, `cursor: not-allowed`.
- **Cancel button** — same geometry, filled `--danger`, hover `--danger-hover`. While running, an inline 14px two-tone arc spinner appears left of the label.
- **Section labels** — Discord-style: 12px / 700 / uppercase / 0.02em letter-spacing / `--text-muted`. Used as the heading inside each section.

### 7.8 Drag-to-move

Same behavior as previously specified, just with Discord's cursor styling:

- Header is the drag handle (`cursor: grab` hover, `grabbing` active). Buttons inside the header intercept their own pointer events.
- Implementation: `pointerdown` on header records `(panelX, panelY, pointerX, pointerY)`, attaches `pointermove`/`pointerup` to `window`. On move, set `transform: translate(x, y)`. On up, persist `{x, y}` to `chrome.storage.local`.
- Viewport clamping: at least 40px of header always remains visible. On window resize, snap back to nearest in-bounds position on next render.
- Reset: double-click on header returns to default bottom-right anchor.
- Honors `prefers-reduced-motion`: snap-back instant if reduced motion is on, otherwise 200ms ease.

### 7.9 Motion

Discord favors restrained motion. We mirror it:

- Panel mount: 200ms ease-out, fade-in only (no slide). Discord's modals appear with a quick fade.
- Tab selection on the boundary picker: 150ms ease-out for the bottom-bar accent slide; content swap is an instant replace (Discord's tabs do not crossfade).
- Hover state transitions on buttons: 100ms `background-color` ease.
- Log autoscroll: instant.
- All transitions become instant under `prefers-reduced-motion: reduce`.

### 7.10 Accessibility

- Visible focus ring on every interactive element: 2px solid `--brand` at full opacity (matches Discord's keyboard focus style).
- Tab order: collapse → close → segmented control tabs → boundary input → primary button.
- `role="region"` + `aria-label="discord-purge"` on root.
- `aria-live="polite"` on the stats row.
- `role="log"` on the log box.

### 7.11 Panel state machine

| State | Trigger | Primary button |
|---|---|---|
| `loading-auth` | mount, before first auth event | disabled "Waiting for Discord…" |
| `ready` | auth captured + channel resolved | enabled "Start" |
| `running` | user pressed Start | "Cancel" (red) |
| `cancelling` | user pressed Cancel | disabled "Cancelling…" |
| `done` | loop exited cleanly | "Run again" |
| `error` | unrecoverable error | "Try again" + last-error banner |

### 7.12 Channel-info resolution

On panel mount and on every SPA navigation that lands on `/@me/*`, call `GET /api/v9/channels/{id}` once to render a friendly target name (`DM with @x`, or `Group DM (3 members): a, b, c`). Cached in memory.

### 7.13 SPA navigation handling

Listen on `popstate`; patch `history.pushState`/`replaceState` to fire a synthetic `discord-purge:locationchange` event on the window. On URL change:

- Leaving `/@me/*` → panel hides itself.
- Entering a different `/@me/{id}` → panel resets to `ready`, refreshes channel info, **aborts any in-flight run**.

### 7.14 Toolbar & popup

- Toolbar icon click on `/@me/*`: toggles panel visibility (in case user dismissed it).
- Toolbar icon click elsewhere on `discord.com`: shows a popup with text *"Open a Discord DM (`discord.com/channels/@me/...`) to use this extension."* and a button that navigates the active tab there.
- Toolbar icon click on non-`discord.com`: same popup but the button opens `https://discord.com/channels/@me/` in a new tab.

### 7.15 No framework

Vanilla TS + tiny `h(tag, attrs, children)` helper. Targeted `textContent` writes for counters; whole panel <500 lines.

## 8. Build, packaging, distribution

### 8.1 Tech stack

TypeScript 5.x, esbuild, SCSS, no UI framework. Node 22+. npm.

### 8.2 Repo layout

```
discord-purge/
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE                                  # GPL-3.0-only
├── manifest/
│   ├── manifest.chrome.json
│   └── manifest.firefox.json
├── src/
│   ├── injected/auth-sniffer.ts
│   ├── content/
│   │   ├── index.ts
│   │   ├── auth.ts
│   │   ├── api/{client.ts, types.ts, snowflake.ts}
│   │   ├── runner/{runner.ts, scheduler.ts, filters.ts}
│   │   ├── ui/{panel.ts, theme.ts, nav.ts, drag.ts, components/}
│   │   ├── ui/styles.scss
│   │   └── log/log.ts
│   ├── background/service-worker.ts
│   ├── popup/{popup.html, popup.ts, popup.scss}
│   └── shared/{messages.ts, constants.ts}
├── assets/icons/
│   ├── source.svg                            # master logo (color)
│   ├── source-mono.svg                       # toolbar monochrome
│   └── (generated: 16/32/48/128/192/512 PNG, favicon.ico)
├── scripts/
│   ├── build.ts                              # esbuild orchestrator
│   ├── pack-zip.ts                           # chrome.zip
│   ├── pack-xpi.ts                           # firefox.xpi
│   ├── pack-userscript.ts                    # discord-purge.user.js
│   ├── gen-icons.ts                          # SVG -> PNG/ICO via sharp
│   └── version.ts                            # tag-derived version stamping
└── dist/                                     # gitignored
    ├── chrome/  chrome.zip
    ├── firefox/  firefox.xpi
    └── discord-purge.user.js
```

### 8.3 Build targets

- `target=chrome` and `target=firefox`: emits four bundles → `auth-sniffer.js` (IIFE), `content.js` (IIFE), `background.js` (ESM SW), `popup.js` (IIFE). SCSS compiled with `sass`, inlined as a string into `panel.ts`. Manifest copied from `manifest/manifest.<target>.json`, version stamped at build.
- `target=userscript`: single esbuild bundle (auth-sniffer + content + Tampermonkey shim). MAIN/ISOLATED bridge collapses to direct calls. Output `dist/discord-purge.user.js` with the standard `==UserScript==` header (`@match https://discord.com/channels/@me/*`, `@grant none`, `@run-at document-start`).

### 8.4 npm scripts

```
npm run dev       # esbuild --watch, target=chrome, unpacked at dist/chrome
npm run build     # build:chrome && build:firefox && build:userscript
npm run pack      # build + zip + xpi + userscript -> dist/
npm run lint      # eslint + tsc --noEmit
```

No `npm test` script — manual browser QA only (see §10).

### 8.5 Manifest (Chrome MV3)

```jsonc
{
  "manifest_version": 3,
  "name": "discord-purge",
  "version": "0.1.0",
  "description": "Bulk-unsend your own messages from Discord DMs.",
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["https://discord.com/*"],
  "background": { "service_worker": "background.js", "type": "module" },
  "action": { "default_popup": "popup.html", "default_icon": { ... } },
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
  "icons": { "16": "...", "32": "...", "48": "...", "128": "..." }
}
```

### 8.6 Firefox manifest deltas

- `browser_specific_settings.gecko.id = "discord-purge@dustfeather"`.
- `background` becomes `{ "scripts": ["background.js"] }` for broadest compat.
- `world: "MAIN"` supported on Firefox 128+; legacy fallback uses runtime `<script>` injection (build flag `--firefox-legacy`).

### 8.7 Tampermonkey constraints

- Single file. No `chrome.runtime`, no `chrome.storage`. Log/prefs persistence falls back to `localStorage` keyed under `discord-purge:*`.
- No background SW; popup features become a `?` link in the panel header pointing at the README.
- `@match https://discord.com/channels/@me/*` mirrors the extension scope.

### 8.8 CI / CD (GitHub Actions)

- **PR workflow:** lint, typecheck, build all three targets, upload artifacts.
- **Tag-push workflow** (`v*`): build, pack, attach `chrome.zip`, `firefox.xpi`, `discord-purge.user.js` to a GitHub Release.
- **AMO + Chrome Web Store auto-publish:** **wired but disabled by default**, gated by GitHub repo variables (e.g. `vars.PUBLISH_AMO == 'true'`). Secrets keys reserved: `AMO_API_KEY`, `AMO_API_SECRET`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_EXTENSION_ID`. To enable, the user sets the variable + secrets in the repo settings.
- **Versioning is tag-derived** — no commit-back-to-main from CI. `${GITHUB_REF_NAME#v}` is injected into both manifests and the userscript header at build time.

### 8.9 Code quality

ESLint (typescript-eslint, security plugin), Prettier, `tsc --noEmit` strict. CI fails on any of these.

## 9. Logo / iconography

Custom mark, vector master committed to `assets/icons/source.svg`, raster exports for 16, 32, 48, 128, 192, 512 PNG plus `.ico` favicon, generated by `scripts/gen-icons.ts` (uses `sharp`).

**Concept:**

- **Shape:** rounded-square app icon (continuous corners, ~22% corner radius on a 1024 grid). Solid Discord blurple (`--brand` = `#5865F2`) fill, no gradient — same color family as Discord's own brand mark, so the toolbar icon reads as "Discord adjacent."
- **Inside:** a single white speech bubble outline (~2px stroke at 1024 scale, rounded corners, tail bottom-left — the standard chat-bubble glyph).
- **Detail:** three dots inside the bubble, horizontal row, **fading right-to-left** — leftmost dot 100% opacity, middle 50%, rightmost 15%. Reads as "messages dissolving" / "typing in reverse" — the visual metaphor for purging DMs.
- **No text in the icon.**
- **Monochrome variant** (`source-mono.svg`): white bubble + dots on transparent, used for the toolbar action icon on platforms that prefer monochrome silhouettes. Generated from the same source SVG at build time via simple template substitution.

The same SVG is referenced as the popup HTML's `<link rel="icon">`. The `.ico` is generated for browsers that prefer that format.

The exact SVG path geometry is authored during implementation; this spec locks the *concept* and the *artifacts list*.

## 10. Manual verification checklist

Since QA is browser-only, the README/CONTRIBUTING points to this checklist. Every release run-through covers:

**Setup:**
- [ ] Install unpacked from `dist/chrome` in Chrome.
- [ ] Install `dist/firefox.xpi` in Firefox via `about:debugging`.
- [ ] Install `dist/discord-purge.user.js` via Tampermonkey.

**Auth capture:**
- [ ] Open `discord.com/channels/@me/<id>` (1:1). Within ~3 s, panel transitions from `loading-auth` → `ready`.
- [ ] Same for a group DM URL.
- [ ] Reload mid-session: capture re-fires.

**UI:**
- [ ] Panel renders bottom-right, 8px rounded, opaque, visually consistent with Discord's modal styling.
- [ ] Toggle Discord theme (User Settings → Appearance) dark↔light: panel updates immediately.
- [ ] Collapse / expand persists across reloads.
- [ ] On non-DM page: panel hidden; toolbar popup shows redirect message.
- [ ] SPA-navigate to a different DM mid-run: in-flight run aborts; panel resets.
- [ ] `prefers-reduced-motion: reduce`: animations disabled.
- [ ] Drag panel: position persists across reloads.
- [ ] Drag panel partially off-screen, resize window: panel snaps back in-bounds.
- [ ] Double-click header: panel returns to default bottom-right anchor.

**Boundary semantics:**
- [ ] None: deletes every authored message in the thread.
- [ ] Datetime: pick a value between two known messages; only messages older than that timestamp get deleted.
- [ ] Message ID: paste an ID; only messages with snowflake < that ID get deleted.
- [ ] Pinned message: never deleted.

**Rate limiting & errors:**
- [ ] Force a 429 (run two extensions side-by-side or a fast burst): panel logs back-off and resumes.
- [ ] Disconnect network mid-run: errors logged, run aborts gracefully, no crash.

**Cancellation:**
- [ ] Click Cancel while running: stops within one in-flight DELETE; counters reflect partial progress.
- [ ] Close tab mid-run: no orphaned background activity.

**Cross-browser:**
- [ ] Full pass on Chrome stable.
- [ ] Full pass on Firefox stable.
- [ ] Smoke pass on Tampermonkey (Chrome + Firefox).

## 11. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Discord ToS — bulk-delete patterns can read as self-bot. | Med | 3.5 s ± 30% spacing; user-initiated only; README disclaimer. No autonomous triggers. |
| Account-action by Trust & Safety from sustained DELETE volume. | Low–Med | Single-flight requests, exponential 429 backoff, 5 s minimum sleep on retry. Panel warns before runs >1000 messages. |
| Captured `Authorization` token leakage. | Low | Token lives only in content-script memory; never written to `chrome.storage`, never sent to background, never logged in cleartext. |
| Discord API versioning (`v9` → `v10`). | Low | Single `API_VERSION` constant. |
| MV3 service-worker termination during a run. | Low | Runner lives in content script, not SW; SW only handles persistence. |
| Firefox MV3 `world: "MAIN"` not supported on older versions. | Med (older FF) | `--firefox-legacy` build flag uses `<script src=getURL(…)>` injection. |
| Discord refactors webpack / DOM such that SPA-nav detection breaks. | Low | Nav detection uses `history.pushState` patching + `popstate`, which Discord doesn't override. |
| User runs the tool then SPA-navigates expecting it to keep going on the previous thread. | Med | Documented behavior: thread switch aborts. Panel banner: *"Run aborted because you switched threads."* |
| `backdrop-filter` not supported on a target browser. | Very low | Opaque-surface fallback specified. |
| Tampermonkey users miss out on popup + background-SW features. | Expected | README documents the gap. The userscript panel includes a `?` link in lieu of the popup. |

## 12. README disclaimer wording

The README will include:

> **Use at your own risk.** Bulk-deleting messages can violate Discord's Terms of Service. The author of this project is not responsible for any account actions taken against you. Review Discord's Terms before use.

## 13. Glossary

- **DM** — direct message thread, including 1:1 and group DMs, all under `https://discord.com/channels/@me/*`.
- **Snowflake** — Discord's 64-bit message/channel ID with timestamp encoded in the upper 42 bits.
- **MAIN world / ISOLATED world** — Chromium content-script execution contexts. MAIN shares `window` with the page; ISOLATED has its own `window` but the same DOM and access to `chrome.runtime`.
- **Blurple** — Discord's brand color, `#5865F2`, used as the panel's primary accent.
