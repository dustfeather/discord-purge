import { isLikelySnowflake } from '../api/snowflake.js';

export type PickedMessage = {
  channelId: string;
  messageId: string;
};

export type PickerHandle = {
  cancel(): void;
};

type StartOpts = {
  /** Restrict picks to this channel id (must match the parsed id). */
  expectedChannelId: string;
  /** Element to NOT count as a valid pick target (the panel host). */
  ignoreRoot: HTMLElement;
  onPick: (m: PickedMessage) => void;
  onCancel: () => void;
};

const isInsideIgnored = (el: EventTarget | null, root: HTMLElement): boolean => {
  if (!(el instanceof Node)) return false;
  // Shadow-DOM-aware check: walk composedPath via parent traversal
  let cur: Node | null = el;
  while (cur) {
    if (cur === root) return true;
    cur = (cur as { parentNode?: Node | null }).parentNode ?? null;
  }
  return false;
};

/**
 * Walk up from `start` looking for a Discord message container we can pluck a
 * channelId/messageId from. Discord's DOM has used several stable patterns:
 *   - <li id="chat-messages-<channelId>-<messageId>">                     (current)
 *   - element[data-list-item-id="chat-messages___<channelId>___<msgId>"]   (sidebar)
 *   - <div id="message-content-<messageId>">                              (older)
 *   - <div id="message-accessories-<messageId>">                          (variant)
 */
const messageFromElement = (start: Element | null): PickedMessage | null => {
  let el: Element | null = start;
  while (el) {
    const id = el.getAttribute('id') ?? '';
    const di = el.getAttribute('data-list-item-id') ?? '';

    let m = id.match(/^chat-messages-(\d{15,25})-(\d{15,25})$/);
    if (m) return { channelId: m[1]!, messageId: m[2]! };

    m = di.match(/^chat-messages___(\d{15,25})___(\d{15,25})$/);
    if (m) return { channelId: m[1]!, messageId: m[2]! };

    m = id.match(/^message-(?:content|accessories)-(\d{15,25})$/);
    if (m && isLikelySnowflake(m[1]!)) {
      // Channel id not encoded here; defer validation to caller
      return { channelId: '', messageId: m[1]! };
    }

    el = el.parentElement;
  }
  return null;
};

const ID = 'discord-purge-picker';

export const startPicker = (opts: StartOpts): PickerHandle => {
  const existing = document.getElementById(ID);
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = ID;
  Object.assign(overlay.style, {
    position: 'fixed',
    pointerEvents: 'none',
    border: '2px solid #5865F2',
    background: 'rgba(88,101,242,0.12)',
    borderRadius: '4px',
    transition: 'all 60ms ease-out',
    zIndex: '2147482999',
    display: 'none',
  } satisfies Partial<CSSStyleDeclaration>);

  const banner = document.createElement('div');
  banner.id = `${ID}-banner`;
  Object.assign(banner.style, {
    position: 'fixed',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#5865F2',
    color: 'white',
    padding: '8px 14px',
    borderRadius: '6px',
    fontFamily: "'gg sans', 'Noto Sans', system-ui, sans-serif",
    fontSize: '13px',
    fontWeight: '500',
    boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
    zIndex: '2147482998',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  banner.textContent = 'Click a message to set as boundary · Esc to cancel';

  document.body.appendChild(overlay);
  document.body.appendChild(banner);

  document.documentElement.style.cursor = 'crosshair';

  const wasNoSelect = document.body.style.userSelect;
  document.body.style.userSelect = 'none';

  const stop = (): void => {
    overlay.remove();
    banner.remove();
    document.documentElement.style.cursor = '';
    document.body.style.userSelect = wasNoSelect;
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKey, true);
  };

  const positionOverlayFor = (el: Element): void => {
    const r = el.getBoundingClientRect();
    overlay.style.display = '';
    overlay.style.left = `${r.left - 2}px`;
    overlay.style.top = `${r.top - 2}px`;
    overlay.style.width = `${r.width}px`;
    overlay.style.height = `${r.height}px`;
  };

  const findTarget = (el: Element | null): { picked: PickedMessage; node: Element } | null => {
    if (!el) return null;
    let cur: Element | null = el;
    while (cur) {
      const m = messageFromElement(cur);
      if (m) {
        // Find the most specific *visual* container by walking back down to the
        // li/[role=article] node we actually want to highlight.
        const visualNode =
          cur.closest('[id^="chat-messages-"]') ??
          cur.closest('[data-list-item-id^="chat-messages___"]') ??
          cur.closest('[role="article"]') ??
          cur;
        return { picked: m, node: visualNode };
      }
      cur = cur.parentElement;
    }
    return null;
  };

  const onMove = (e: PointerEvent): void => {
    if (isInsideIgnored(e.target, opts.ignoreRoot)) {
      overlay.style.display = 'none';
      return;
    }
    const tgt = findTarget(e.target as Element | null);
    if (!tgt) {
      overlay.style.display = 'none';
      return;
    }
    if (tgt.picked.channelId && tgt.picked.channelId !== opts.expectedChannelId) {
      // hovering over a different channel's message (sidebar etc.)
      overlay.style.display = 'none';
      return;
    }
    positionOverlayFor(tgt.node);
  };

  const onClick = (e: MouseEvent): void => {
    if (isInsideIgnored(e.target, opts.ignoreRoot)) return;
    const tgt = findTarget(e.target as Element | null);
    if (!tgt) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (tgt.picked.channelId && tgt.picked.channelId !== opts.expectedChannelId) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const channelId = tgt.picked.channelId || opts.expectedChannelId;
    stop();
    opts.onPick({ channelId, messageId: tgt.picked.messageId });
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      stop();
      opts.onCancel();
    }
  };

  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onKey, true);

  return { cancel: () => { stop(); opts.onCancel(); } };
};
