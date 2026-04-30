import { isLikelySnowflake } from '../../api/snowflake.js';
import type { Boundary } from '../../../shared/types.js';
import { h } from '../h.js';

export type BoundaryApi = {
  el: HTMLElement;
  value(): Boundary;
};

type Mode = 'none' | 'datetime' | 'messageId';

export const renderBoundary = (): BoundaryApi => {
  let mode: Mode = 'none';

  const tabPairs: [HTMLButtonElement, Mode][] = [];
  const tabsRow = h('div', { className: 'tabs', role: 'tablist' });

  const inputArea = h('div', null);
  const help = h('p', { className: 'help' }, 'Only delete messages older than this.');

  const datetimeInput = h('input', { type: 'datetime-local', step: '60' }) as HTMLInputElement;
  const messageInput = h('input', {
    type: 'text',
    inputmode: 'numeric',
    pattern: '\\d{15,25}',
    placeholder: 'e.g. 1081268290455879770',
  }) as HTMLInputElement;

  const renderInputs = () => {
    inputArea.replaceChildren();
    if (mode === 'datetime') inputArea.appendChild(datetimeInput);
    if (mode === 'messageId') inputArea.appendChild(messageInput);
    help.style.visibility = mode === 'none' ? 'hidden' : 'visible';
  };

  for (const [label, m] of [
    ['None', 'none'],
    ['Datetime', 'datetime'],
    ['Message ID', 'messageId'],
  ] as const) {
    const t = h('button', {
      type: 'button',
      role: 'tab',
      className: 'tab',
      'aria-selected': mode === m ? 'true' : 'false',
      onClick: () => {
        mode = m;
        for (const [tt, mm] of tabPairs) {
          tt.setAttribute('aria-selected', mm === mode ? 'true' : 'false');
        }
        renderInputs();
      },
    }, label) as HTMLButtonElement;
    tabPairs.push([t, m]);
    tabsRow.appendChild(t);
  }
  // mark first selected
  tabPairs[0]![0].setAttribute('aria-selected', 'true');
  renderInputs();

  const el = h('div', null, [tabsRow, inputArea, help]);

  return {
    el,
    value(): Boundary {
      if (mode === 'none') return { kind: 'none' };
      if (mode === 'datetime') {
        const v = datetimeInput.value.trim();
        if (!v) return { kind: 'none' };
        return { kind: 'datetime', iso: v };
      }
      const v = messageInput.value.trim();
      if (!v || !isLikelySnowflake(v)) return { kind: 'none' };
      return { kind: 'messageId', id: v };
    },
  };
};
