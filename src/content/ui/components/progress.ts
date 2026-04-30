import type { RunStats } from '../../../shared/types.js';
import { h } from '../h.js';

export type ProgressApi = { el: HTMLElement; update(s: RunStats): void; reset(): void };

const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const hr = Math.floor(totalSec / 3600);
  const mn = Math.floor((totalSec % 3600) / 60);
  const sc = totalSec % 60;
  if (hr > 0) return `${hr}h ${mn}m ${sc}s`;
  if (mn > 0) return `${mn}m ${sc}s`;
  return `${sc}s`;
};

export const renderProgress = (): ProgressApi => {
  const fill = h('div', {
    className: 'progress-fill',
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': '0',
  });
  const bar = h('div', { className: 'progress-bar' }, [fill]);
  const text = h('p', { className: 'progress-text' }, 'Idle');
  const el = h('div', { className: 'progress' }, [bar, text]);

  const setPct = (pct: number) => {
    const clamped = Math.max(0, Math.min(100, pct));
    fill.style.width = `${clamped}%`;
    fill.setAttribute('aria-valuenow', String(clamped));
  };

  const reset = () => {
    setPct(0);
    text.textContent = 'Idle';
  };

  const update = (s: RunStats) => {
    if (s.phase === 'collecting') {
      const page = s.collectingPage > 0 ? s.collectingPage : 1;
      text.textContent = `Collecting… (page ${page})`;
      setPct(0);
      return;
    }
    if (s.phase === 'deleting') {
      const total = s.totalCandidates;
      const done = s.deleted + s.alreadyGone + s.forbidden + s.errors;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      setPct(pct);
      if (total === 0) {
        text.textContent = 'Nothing to delete';
        return;
      }
      if (done === 0 || s.phaseStartedAt === null) {
        text.textContent = `[0/${total}] 0%`;
        return;
      }
      const elapsed = Date.now() - s.phaseStartedAt;
      const avg = elapsed / done;
      const remaining = (total - done) * avg;
      text.textContent = `[${done}/${total}] ${pct}% | Elapsed: ${formatDuration(elapsed)} | Remaining: ~${formatDuration(remaining)}`;
      return;
    }
    reset();
  };

  return { el, update, reset };
};
