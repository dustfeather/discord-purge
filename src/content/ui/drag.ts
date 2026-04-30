export type Position = { x: number; y: number };

export type DragOptions = {
  panel: HTMLElement;
  handle: HTMLElement;
  initial: Position | null;
  onChange: (p: Position) => void;
  onReset: () => void;
};

const HEADER_VISIBLE = 40;

const clamp = (p: Position, panel: HTMLElement): Position => {
  const w = panel.offsetWidth;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.min(Math.max(p.x, -w + HEADER_VISIBLE), vw - HEADER_VISIBLE),
    y: Math.min(Math.max(p.y, 0), vh - HEADER_VISIBLE),
  };
};

export const installDrag = ({
  panel,
  handle,
  initial,
  onChange,
  onReset,
}: DragOptions): (() => void) => {
  if (initial && initial.x >= 0 && initial.y >= 0) {
    const p = clamp(initial, panel);
    panel.style.left = `${p.x}px`;
    panel.style.top = `${p.y}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.icon-btn')) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = panel.getBoundingClientRect();
    originX = rect.left;
    originY = rect.top;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const next = clamp(
      { x: originX + (e.clientX - startX), y: originY + (e.clientY - startY) },
      panel,
    );
    panel.style.left = `${next.x}px`;
    panel.style.top = `${next.y}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch {
      // noop
    }
    const rect = panel.getBoundingClientRect();
    onChange({ x: rect.left, y: rect.top });
  };
  const onDoubleClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.icon-btn')) return;
    panel.style.left = '';
    panel.style.top = '';
    panel.style.right = '16px';
    panel.style.bottom = '16px';
    onReset();
  };
  const onResize = () => {
    const rect = panel.getBoundingClientRect();
    const next = clamp({ x: rect.left, y: rect.top }, panel);
    if (next.x !== rect.left || next.y !== rect.top) {
      panel.style.left = `${next.x}px`;
      panel.style.top = `${next.y}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }
  };

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('pointercancel', onPointerUp);
  handle.addEventListener('dblclick', onDoubleClick);
  window.addEventListener('resize', onResize);

  return () => {
    handle.removeEventListener('pointerdown', onPointerDown);
    handle.removeEventListener('pointermove', onPointerMove);
    handle.removeEventListener('pointerup', onPointerUp);
    handle.removeEventListener('pointercancel', onPointerUp);
    handle.removeEventListener('dblclick', onDoubleClick);
    window.removeEventListener('resize', onResize);
  };
};
