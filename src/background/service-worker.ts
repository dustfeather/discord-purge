import type { BgResponse, BgToContent, ContentToBg } from '../shared/messages.js';
import { STORAGE_KEYS } from '../shared/constants.js';
import type { LogLine, RunStats } from '../shared/types.js';

const LOG_CAPACITY = 200;
const DM_URL = 'https://discord.com/channels/@me/';
const DISCORD_DM_PREFIX = 'https://discord.com/channels/@me/';

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
          sendResponse(
            ok(
              (await get<{ x: number; y: number }>(STORAGE_KEYS.panelPosition)) ?? null,
            ),
          );
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
        case 'panel:setHidden': {
          await set(STORAGE_KEYS.panelHidden, m.hidden);
          sendResponse(ok());
          return;
        }
        case 'panel:getHidden': {
          sendResponse(ok((await get<boolean>(STORAGE_KEYS.panelHidden)) ?? null));
          return;
        }
      }
    } catch (e) {
      sendResponse({ ok: false, error: (e as Error).message });
    }
  })();
  return true;
});

chrome.action.onClicked.addListener((tab) => {
  void (async () => {
    if (!tab?.id) return;
    const url = tab.url ?? '';
    if (url.startsWith(DISCORD_DM_PREFIX)) {
      const msg: BgToContent = { kind: 'panel:toggleVisibility' };
      try {
        await chrome.tabs.sendMessage(tab.id, msg);
      } catch {
        // Content script may not be loaded yet; nothing else to do.
      }
      return;
    }
    if (url.startsWith('https://discord.com/')) {
      await chrome.tabs.update(tab.id, { url: DM_URL });
      return;
    }
    await chrome.tabs.create({ url: DM_URL });
  })();
});
