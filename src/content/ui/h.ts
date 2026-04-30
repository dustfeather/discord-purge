type Attrs = Record<string, unknown> & { style?: Partial<CSSStyleDeclaration> };
type Child = Node | string | number | false | null | undefined;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  children?: Child[] | Child,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v as Partial<CSSStyleDeclaration>);
      } else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (k === 'className') {
        el.className = String(v);
      } else if (k === 'dataset' && typeof v === 'object' && v !== null) {
        for (const [dk, dv] of Object.entries(v as Record<string, string>)) {
          el.dataset[dk] = dv;
        }
      } else if (typeof v === 'boolean') {
        if (v) el.setAttribute(k, '');
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
