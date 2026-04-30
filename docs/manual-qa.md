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
