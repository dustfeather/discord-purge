import { h } from '../h.js';

const ICON_CHEVRON = `<svg viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_CLOSE = `<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

const iconBtn = (svg: string, title: string, onClick: () => void): HTMLButtonElement => {
  const b = h('button', {
    className: 'icon-btn',
    type: 'button',
    title,
    'aria-label': title,
    onClick,
  });
  b.innerHTML = svg;
  return b;
};

export type HeaderApi = {
  el: HTMLElement;
  setCollapsed(c: boolean): void;
};

export const renderHeader = (opts: {
  onToggleCollapse: (next: boolean) => void;
  onClose: () => void;
  initialCollapsed: boolean;
}): HeaderApi => {
  let collapsed = opts.initialCollapsed;
  const collapse = iconBtn(ICON_CHEVRON, 'Collapse', () => {
    collapsed = !collapsed;
    opts.onToggleCollapse(collapsed);
    update();
  });
  const close = iconBtn(ICON_CLOSE, 'Close', () => opts.onClose());

  const el = h(
    'header',
    { className: 'header', role: 'group', 'aria-label': 'discord-purge header' },
    [h('h2', null, 'discord-purge'), collapse, close],
  );

  const update = () => {
    collapse.style.transform = collapsed ? 'rotate(180deg)' : '';
  };
  update();

  return {
    el,
    setCollapsed(c: boolean) {
      collapsed = c;
      update();
    },
  };
};
