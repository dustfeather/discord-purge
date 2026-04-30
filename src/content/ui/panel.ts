import css from './styles.scss';

import type { Boundary, PanelState, RunStats } from '../../shared/types.js';
import type { DiscordChannel } from '../api/types.js';
import { renderHeader } from './components/header.js';
import { renderSection } from './components/section.js';
import { renderTarget } from './components/target.js';
import { renderBoundary } from './components/boundary.js';
import { renderStats } from './components/stats.js';
import { renderProgress } from './components/progress.js';
import { renderLogBox } from './components/log.js';
import { renderPrimaryButton } from './components/primaryBtn.js';
import type { Logger } from '../log/log.js';
import { installDrag, type Position } from './drag.js';
import { watchTheme } from './theme.js';
import { h } from './h.js';

export type PanelApi = {
  setState(s: PanelState): void;
  setStats(s: RunStats): void;
  setChannel(channel: DiscordChannel | null): void;
  setChannelId(id: string | null): void;
  hide(): void;
  show(): void;
  destroy(): void;
  boundary(): Boundary;
  onStart(cb: () => void): void;
  onCancel(cb: () => void): void;
};

const sendBg = <T = unknown>(msg: unknown): Promise<T | undefined> =>
  new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        resolve(undefined);
        return;
      }
      chrome.runtime.sendMessage(msg, (resp) => resolve(resp as T));
    } catch {
      resolve(undefined);
    }
  });

type BgEnvelope<T> = { ok: true; data: T } | { ok: false; error: string } | undefined;

export const mountPanel = async (logger: Logger): Promise<PanelApi> => {
  const host = document.createElement('div');
  host.id = 'discord-purge-root';
  Object.assign(host.style, { all: 'initial', position: 'fixed', zIndex: '2147483000' });
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = css;
  shadow.appendChild(style);

  const initialPosResp = (await sendBg<{ ok: true; data: Position | null }>({
    kind: 'panel:getPosition',
  })) as BgEnvelope<Position | null>;
  const initialCollapsedResp = (await sendBg<{ ok: true; data: boolean }>({
    kind: 'panel:getCollapsed',
  })) as BgEnvelope<boolean>;
  const initialPos = initialPosResp && initialPosResp.ok ? initialPosResp.data : null;
  const initialCollapsed = !!(initialCollapsedResp && initialCollapsedResp.ok && initialCollapsedResp.data);

  let onStart: () => void = () => undefined;
  let onCancel: () => void = () => undefined;

  const panel = h('div', {
    className: 'panel',
    role: 'region',
    'aria-label': 'discord-purge',
    dataset: { collapsed: String(initialCollapsed) },
  });
  const headerApi = renderHeader({
    initialCollapsed,
    onToggleCollapse: (c) => {
      panel.dataset['collapsed'] = String(c);
      void sendBg({ kind: 'panel:setCollapsed', collapsed: c });
    },
    onClose: () => {
      panel.style.display = 'none';
    },
  });

  let currentChannelId: string | null = null;
  const target = renderTarget();
  const boundary = renderBoundary({
    getChannelId: () => currentChannelId,
    ignoreRoot: host,
  });
  const stats = renderStats();
  const progress = renderProgress();
  const logBox = renderLogBox(logger);
  const primary = renderPrimaryButton();

  const statsSection = renderSection('Stats', stats.el);
  statsSection.style.display = 'none';
  const progressSection = renderSection('Progress', progress.el);
  progressSection.style.display = 'none';

  const body = h('div', { className: 'panel-body' }, [
    renderSection('Target', target.el),
    renderSection('Boundary', boundary.el),
    progressSection,
    statsSection,
    renderSection('Log', logBox.el),
    primary.el,
  ]);

  panel.appendChild(headerApi.el);
  panel.appendChild(body);
  shadow.appendChild(panel);

  const themeWatcher = watchTheme();
  const unsubscribeTheme = themeWatcher.subscribe((t) => panel.setAttribute('data-theme', t));

  const uninstallDrag = installDrag({
    panel,
    handle: headerApi.el,
    initial: initialPos,
    onChange: (p) => {
      void sendBg({ kind: 'panel:setPosition', x: p.x, y: p.y });
    },
    onReset: () => {
      void sendBg({ kind: 'panel:setPosition', x: -1, y: -1 });
    },
  });

  const applyState = (s: PanelState) => {
    switch (s) {
      case 'loading-auth':
        primary.set({ kind: 'loading', label: 'Waiting for Discord…' });
        statsSection.style.display = 'none';
        progressSection.style.display = 'none';
        progress.reset();
        break;
      case 'ready':
        primary.set({ kind: 'idle', label: 'Start', onClick: () => onStart() });
        statsSection.style.display = 'none';
        progressSection.style.display = 'none';
        progress.reset();
        break;
      case 'running':
        primary.set({ kind: 'running', label: 'Cancel', onClick: () => onCancel() });
        statsSection.style.display = 'none';
        progressSection.style.display = '';
        break;
      case 'cancelling':
        primary.set({ kind: 'cancelling', label: 'Cancelling…' });
        statsSection.style.display = 'none';
        progressSection.style.display = '';
        break;
      case 'done':
        primary.set({ kind: 'idle', label: 'Run again', onClick: () => onStart() });
        statsSection.style.display = '';
        progressSection.style.display = 'none';
        break;
      case 'error':
        primary.set({ kind: 'idle', label: 'Try again', onClick: () => onStart() });
        statsSection.style.display = '';
        progressSection.style.display = 'none';
        break;
    }
  };
  applyState('loading-auth');

  return {
    setState: applyState,
    setStats: (s) => {
      stats.update(s);
      progress.update(s);
    },
    setChannel: (c) => target.setChannel(c),
    setChannelId: (id) => {
      currentChannelId = id;
    },
    hide() {
      panel.style.display = 'none';
    },
    show() {
      panel.style.display = '';
    },
    destroy() {
      unsubscribeTheme();
      themeWatcher.destroy();
      uninstallDrag();
      host.remove();
    },
    boundary: () => boundary.value(),
    onStart(cb) {
      onStart = cb;
    },
    onCancel(cb) {
      onCancel = cb;
    },
  };
};
