import type { Logger } from '../../log/log.js';
import type { LogLine } from '../../../shared/types.js';
import { h } from '../h.js';

export type LogBoxApi = { el: HTMLElement };

const fmtTs = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour12: false });
};

export const renderLogBox = (logger: Logger): LogBoxApi => {
  const list = h('div', { role: 'log', 'aria-live': 'polite' });
  const newPill = h(
    'button',
    { className: 'log-newpill', type: 'button', style: { display: 'none' } },
    '↓ new',
  );
  const wrap = h('div', { className: 'log-box' }, [list, newPill]);

  const renderLine = (l: LogLine) => {
    const line = h('div', { className: 'log-line' }, [
      h('span', { className: 'ts' }, fmtTs(l.ts)),
      l.msg,
    ]);
    list.appendChild(line);
  };

  let userScrolled = false;
  wrap.addEventListener('scroll', () => {
    const atBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 4;
    userScrolled = !atBottom;
    newPill.style.display = userScrolled ? 'inline-flex' : 'none';
  });

  newPill.addEventListener('click', () => {
    wrap.scrollTop = wrap.scrollHeight;
    userScrolled = false;
    newPill.style.display = 'none';
  });

  for (const line of logger.lines()) renderLine(line);
  logger.subscribe((line) => {
    renderLine(line);
    if (!userScrolled) wrap.scrollTop = wrap.scrollHeight;
  });

  return { el: wrap };
};
