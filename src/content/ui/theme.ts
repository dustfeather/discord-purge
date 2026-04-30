export type Theme = 'dark' | 'light';

export type ThemeWatcher = {
  current(): Theme;
  subscribe(cb: (t: Theme) => void): () => void;
  destroy(): void;
};

const detectTheme = (): Theme => {
  const cls = document.documentElement.classList;
  if (cls.contains('theme-light')) return 'light';
  if (cls.contains('theme-dark')) return 'dark';
  return 'dark';
};

export const watchTheme = (): ThemeWatcher => {
  let current = detectTheme();
  const listeners = new Set<(t: Theme) => void>();
  const obs = new MutationObserver(() => {
    const next = detectTheme();
    if (next === current) return;
    current = next;
    for (const l of listeners) {
      try {
        l(current);
      } catch {
        // noop
      }
    }
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return {
    current: () => current,
    subscribe(cb) {
      listeners.add(cb);
      cb(current);
      return () => listeners.delete(cb);
    },
    destroy() {
      obs.disconnect();
      listeners.clear();
    },
  };
};
