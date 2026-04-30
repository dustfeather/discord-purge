import { h } from '../h.js';

export const renderSection = (label: string, body: HTMLElement): HTMLElement =>
  h('section', { className: 'section' }, [
    h('h3', { className: 'section-label' }, label),
    body,
  ]);
