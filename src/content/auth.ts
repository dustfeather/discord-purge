import { EVENT_AUTH } from '../shared/constants.js';
import type { AuthHeaders } from '../shared/types.js';

let current: AuthHeaders | null = null;
const listeners = new Set<(a: AuthHeaders) => void>();

window.addEventListener(EVENT_AUTH, (e) => {
  const detail = (e as CustomEvent<{ headers: AuthHeaders }>).detail;
  current = detail.headers;
  for (const l of listeners) {
    try {
      l(current);
    } catch (err) {
      console.warn('[discord-purge] auth listener error', err);
    }
  }
});

export const getAuth = (): AuthHeaders | null => current;

export const onAuth = (cb: (a: AuthHeaders) => void): (() => void) => {
  listeners.add(cb);
  if (current) cb(current);
  return () => listeners.delete(cb);
};
