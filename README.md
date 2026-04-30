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
