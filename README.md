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

The full design is in [`docs/superpowers/specs/2026-05-01-discord-purge-design.md`](./docs/superpowers/specs/2026-05-01-discord-purge-design.md). Manual QA checklist in [`docs/manual-qa.md`](./docs/manual-qa.md). Implementation plan in [`docs/superpowers/plans/2026-05-01-discord-purge.md`](./docs/superpowers/plans/2026-05-01-discord-purge.md).

## CI / publishing

- **Every PR / push to `main`** runs lint + typecheck + build, uploads dev artifacts.
- **Tags `v*`** trigger a packaged GitHub Release.
- **AMO and Chrome Web Store auto-publish** are wired but disabled by default. Enable per repo:
  - Set repo variable `PUBLISH_AMO=true` and secrets `AMO_API_KEY`, `AMO_API_SECRET`.
  - Set repo variable `PUBLISH_CWS=true`, `CWS_EXTENSION_ID`, and secrets `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`.

## License

GPL-3.0-only. See [LICENSE](./LICENSE).
