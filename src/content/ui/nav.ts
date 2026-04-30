import { EVENT_LOCATION, ROUTE_DM_REGEX } from '../../shared/constants.js';

export type LocationState = {
  isDm: boolean;
  channelId: string | null;
};

let installed = false;

export const installNavListener = (): void => {
  if (installed) return;
  installed = true;
  const wrap = (key: 'pushState' | 'replaceState') => {
    const orig = history[key];
    history[key] = function (this: History, ...args: Parameters<History['pushState']>) {
      const r = orig.apply(this, args);
      window.dispatchEvent(new Event(EVENT_LOCATION));
      return r;
    };
  };
  wrap('pushState');
  wrap('replaceState');
  window.addEventListener('popstate', () => window.dispatchEvent(new Event(EVENT_LOCATION)));
};

export const readLocation = (): LocationState => {
  const path = window.location.pathname;
  const m = path.match(ROUTE_DM_REGEX);
  return { isDm: !!m, channelId: m?.[1] ?? null };
};

export const onLocationChange = (cb: (s: LocationState) => void): (() => void) => {
  const handler = () => cb(readLocation());
  window.addEventListener(EVENT_LOCATION, handler);
  return () => window.removeEventListener(EVENT_LOCATION, handler);
};
