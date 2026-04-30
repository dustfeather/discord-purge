import { h } from '../h.js';

export type PrimaryButtonState =
  | { kind: 'loading'; label: string }
  | { kind: 'idle'; label: string; onClick: () => void }
  | { kind: 'running'; label: string; onClick: () => void }
  | { kind: 'cancelling'; label: string };

export type PrimaryButtonApi = {
  el: HTMLElement;
  set(state: PrimaryButtonState): void;
};

export const renderPrimaryButton = (): PrimaryButtonApi => {
  const btn = h('button', { type: 'button', className: 'btn-primary' }) as HTMLButtonElement;

  const apply = (state: PrimaryButtonState): void => {
    btn.replaceChildren();
    btn.disabled = false;
    btn.onclick = null;

    switch (state.kind) {
      case 'loading':
        btn.disabled = true;
        btn.className = 'btn-primary';
        btn.textContent = state.label;
        return;
      case 'idle':
        btn.className = 'btn-primary';
        btn.textContent = state.label;
        btn.onclick = state.onClick;
        return;
      case 'running':
        btn.className = 'btn-cancel';
        btn.appendChild(h('span', { className: 'spinner' }));
        btn.appendChild(document.createTextNode(state.label));
        btn.onclick = state.onClick;
        return;
      case 'cancelling':
        btn.disabled = true;
        btn.className = 'btn-cancel';
        btn.appendChild(h('span', { className: 'spinner' }));
        btn.appendChild(document.createTextNode(state.label));
        return;
    }
  };

  return { el: btn, set: apply };
};
