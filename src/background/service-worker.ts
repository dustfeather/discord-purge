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
      }
    } catch (e) {
      sendResponse({ ok: false, error: (e as Error).message });
    }
  })();
  return true;
});
