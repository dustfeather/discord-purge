import { isLikelySnowflake, snowflakeToMs } from '../../api/snowflake.js';
import type { Boundary } from '../../../shared/types.js';
import { h } from '../h.js';
import { startPicker } from '../picker.js';

export type BoundaryApi = {
  el: HTMLElement;
  value(): Boundary;
};

export type BoundaryDeps = {
  getChannelId: () => string | null;
  ignoreRoot: HTMLElement;
};

type Mode = 'none' | 'datetime' | 'messageId';

const fmtPicked = (id: string): string => {
  try {
    const d = new Date(snowflakeToMs(id));
    return `Picked: ${d.toLocaleString()} (id ${id})`;
  } catch {
    return `Picked: id ${id}`;
  }
};

export const renderBoundary = (deps: BoundaryDeps): BoundaryApi => {
  let mode: Mode = 'none';

  const tabPairs: [HTMLButtonElement, Mode][] = [];
  const tabsRow = h('div', { className: 'tabs', role: 'tablist' });

  const inputArea = h('div', { className: 'boundary-input' });
  const help = h('p', { className: 'help' }, 'Only delete messages older than this.');

  const datetimeInput = h('input', { type: 'datetime-local', step: '60' }) as HTMLInputElement;

  const messageInput = h('input', {
    type: 'text',
    inputmode: 'numeric',
    pattern: '\\d{15,25}',
    placeholder: 'Pick a message, or paste an ID',
  }) as HTMLInputElement;

  const pickedPreview = h('p', { className: 'help picked' }, '') as HTMLParagraphElement;
  pickedPreview.style.display = 'none';

  const updatePreviewFromInput = () => {
    const v = messageInput.value.trim();
    if (v && isLikelySnowflake(v)) {
      pickedPreview.textContent = fmtPicked(v);
      pickedPreview.style.display = '';
    } else {
      pickedPreview.style.display = 'none';
    }
  };
  messageInput.addEventListener('input', updatePreviewFromInput);

  let pickerActive = false;
  const pickBtn = h(
    'button',
    {
      type: 'button',
      className: 'btn-secondary pick-btn',
      title: 'Click a message in chat to set as boundary',
    },
    'Pick',
  ) as HTMLButtonElement;

  const setPickerLabel = (active: boolean) => {
    pickBtn.textContent = active ? 'Cancel pick' : 'Pick';
    pickBtn.classList.toggle('active', active);
    pickerActive = active;
  };

  pickBtn.addEventListener('click', () => {
    if (pickerActive) {
      // No direct cancel handle here — startPicker returns one. Re-arm by toggling label;
      // the picker module itself handles Esc/cancel. Refire startPicker only if not already.
      // Simplest: dispatch an Escape keydown to its window listener.
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      return;
    }
    const channelId = deps.getChannelId();
    if (!channelId) return;
    setPickerLabel(true);
    const handle = startPicker({
      expectedChannelId: channelId,
      ignoreRoot: deps.ignoreRoot,
      onPick: ({ messageId }) => {
        messageInput.value = messageId;
        updatePreviewFromInput();
        setPickerLabel(false);
      },
      onCancel: () => setPickerLabel(false),
    });
    // Track handle for safety; in practice we drive cancel via Escape dispatch above.
    void handle;
  });

  const messageRow = h('div', { className: 'boundary-row' }, [messageInput, pickBtn]);

  const renderInputs = () => {
    inputArea.replaceChildren();
    if (mode === 'datetime') inputArea.appendChild(datetimeInput);
    if (mode === 'messageId') {
      inputArea.appendChild(messageRow);
      inputArea.appendChild(pickedPreview);
    }
    help.style.visibility = mode === 'none' ? 'hidden' : 'visible';
    if (mode === 'messageId') updatePreviewFromInput();
  };

  for (const [label, m] of [
    ['None', 'none'],
    ['Datetime', 'datetime'],
    ['Message', 'messageId'],
  ] as const) {
    const t = h(
      'button',
      {
        type: 'button',
        role: 'tab',
        className: 'tab',
        'aria-selected': mode === m ? 'true' : 'false',
        onClick: () => {
          if (mode === m) return;
          mode = m;
          for (const [tt, mm] of tabPairs) {
            tt.setAttribute('aria-selected', mm === mode ? 'true' : 'false');
          }
          renderInputs();
        },
      },
      label,
    ) as HTMLButtonElement;
    tabPairs.push([t, m]);
    tabsRow.appendChild(t);
  }
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
