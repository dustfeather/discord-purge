declare const __FIREFOX_LEGACY__: boolean;
declare const __USERSCRIPT__: boolean;

// Always run the sniffer module's side-effect — it is idempotent (self-guarded).
// In userscript mode this is the only place it runs, wrapping page-world fetch/XHR.
// In extension mode the manifest also runs auth-sniffer.js in MAIN world; this
// extra ISOLATED-world copy is a harmless no-op since each world has its own
// fetch/XHR and its own __discordPurgeSniffer flag.
import '../injected/auth-sniffer.js';

if (typeof __FIREFOX_LEGACY__ !== 'undefined' && __FIREFOX_LEGACY__) {
  try {
    const url = chrome.runtime.getURL('auth-sniffer.js');
    const s = document.createElement('script');
    s.src = url;
    s.async = false;
    (document.head ?? document.documentElement).appendChild(s);
    s.remove();
  } catch (e) {
    console.warn('[discord-purge] could not inject auth-sniffer', e);
  }
}

import { createApiClient } from './api/client.js';
import { getAuth, onAuth } from './auth.js';
import { Logger } from './log/log.js';
import { runPurge } from './runner/runner.js';
import { mountPanel, type PanelApi } from './ui/panel.js';
import { installNavListener, onLocationChange, readLocation } from './ui/nav.js';
import type { Boundary, RunStats } from '../shared/types.js';
import type { BgToContent } from '../shared/messages.js';

const RUN_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `dp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const logger = new Logger();

let panel: PanelApi | null = null;
let abort: AbortController | null = null;

// Userscript users have no extension icon to click — start visible. Extension
// users get the icon as the entry point — start hidden until they click.
let panelHidden = !__USERSCRIPT__;

const api = createApiClient({ getAuth, runId: RUN_ID });

const sendBg = (msg: unknown): Promise<unknown> =>
  new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        resolve(undefined);
        return;
      }
      chrome.runtime.sendMessage(msg, (resp) => resolve(resp));
    } catch {
      resolve(undefined);
    }
  });

type BgEnvelope<T> = { ok: true; data: T } | { ok: false; error: string } | undefined;

const cancel = (): void => {
  if (!abort) return;
  panel?.setState('cancelling');
  logger.append('run: cancellation requested');
  abort.abort();
};

const start = async (): Promise<void> => {
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

const applyVisibility = (): void => {
  if (!panel) return;
  const loc = readLocation();
  const onDm = loc.isDm && !!loc.channelId;
  if (onDm && !panelHidden) panel.show();
  else panel.hide();
};

const applyLocation = async (): Promise<void> => {
  if (!panel) return;
  const loc = readLocation();
  if (!loc.isDm || !loc.channelId) {
    panel.setChannelId(null);
    applyVisibility();
    if (abort) cancel();
    return;
  }
  panel.setChannelId(loc.channelId);
  applyVisibility();
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

const setHidden = (hidden: boolean): void => {
  panelHidden = hidden;
  applyVisibility();
  if (!__USERSCRIPT__) {
    void sendBg({ kind: 'panel:setHidden', hidden });
  }
};

const setupPanel = async (): Promise<void> => {
  if (!__USERSCRIPT__) {
    const resp = (await sendBg({ kind: 'panel:getHidden' })) as BgEnvelope<boolean | null>;
    if (resp && resp.ok && typeof resp.data === 'boolean') {
      panelHidden = resp.data;
    }
  }

  panel = await mountPanel(logger);
  panel.onStart(() => void start());
  panel.onCancel(() => cancel());
  panel.onHideRequested(() => setHidden(true));
  await applyLocation();
};

const installToggleListener = (): void => {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
  chrome.runtime.onMessage.addListener((message: unknown) => {
    const m = message as BgToContent | undefined;
    if (m?.kind === 'panel:toggleVisibility') {
      setHidden(!panelHidden);
    }
    return false;
  });
};

const main = async (): Promise<void> => {
  installNavListener();
  if (!__USERSCRIPT__) installToggleListener();
  await setupPanel();

  onAuth(() => {
    if (panel && !abort) {
      void applyLocation();
      panel.setState('ready');
    }
  });

  onLocationChange(() => {
    if (abort) cancel();
    void applyLocation();
  });
};

void main();
