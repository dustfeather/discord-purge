declare const __FIREFOX_LEGACY__: boolean;

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

const RUN_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `dp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const logger = new Logger();

let panel: PanelApi | null = null;
let abort: AbortController | null = null;

const api = createApiClient({ getAuth, runId: RUN_ID });

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

const applyLocation = async (): Promise<void> => {
  if (!panel) return;
  const loc = readLocation();
  if (!loc.isDm || !loc.channelId) {
    panel.setChannelId(null);
    panel.hide();
    if (abort) cancel();
    return;
  }
  panel.show();
  panel.setChannelId(loc.channelId);
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

const setupPanel = async (): Promise<void> => {
  panel = await mountPanel(logger);
  panel.onStart(() => void start());
  panel.onCancel(() => cancel());
  await applyLocation();
};

const main = async (): Promise<void> => {
  installNavListener();
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
