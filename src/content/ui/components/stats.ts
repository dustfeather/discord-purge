import type { RunStats } from '../../../shared/types.js';
import { h } from '../h.js';

export type StatsApi = { el: HTMLElement; update(s: RunStats): void };

const cell = (label: string) => {
  const value = h('div', { className: 'stat-value' }, '0');
  const el = h('div', { className: 'stat' }, [
    h('div', { className: 'stat-label' }, label),
    value,
  ]);
  return { el, value };
};

export const renderStats = (): StatsApi => {
  const scanned = cell('Scanned');
  const deleted = cell('Deleted');
  const skipped = cell('Skipped');
  const errors = cell('Errors');
  const el = h(
    'div',
    { className: 'stat-row', role: 'group', 'aria-label': 'run statistics' },
    [scanned.el, deleted.el, skipped.el, errors.el],
  );

  return {
    el,
    update(s) {
      scanned.value.textContent = String(s.scanned);
      deleted.value.textContent = String(s.deleted);
      skipped.value.textContent = String(s.skipped + s.alreadyGone + s.forbidden);
      errors.value.textContent = String(s.errors);
    },
  };
};
