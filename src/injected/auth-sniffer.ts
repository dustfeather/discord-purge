import {
  API_BASE,
  EVENT_AUTH,
  RELEVANT_AUTH_HEADERS,
  type RelevantAuthHeader,
} from '../shared/constants.js';
import type { AuthHeaders } from '../shared/types.js';

(() => {
  type SnifferGlobal = { __discordPurgeSniffer?: boolean };
  const w = window as unknown as SnifferGlobal;
  if (w.__discordPurgeSniffer) return;
  w.__discordPurgeSniffer = true;

  const RELEVANT = new Set<string>(RELEVANT_AUTH_HEADERS);
  const snapshot: Record<string, string> = {};
  let lastEmittedHash = '';

  const isDiscordApi = (url: string | URL | Request): boolean => {
    const s =
      typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    return s.startsWith(`${API_BASE}/`) || s.startsWith('/api/');
  };

  const captureFromHeaders = (h: Headers): void => {
    for (const [k, v] of h.entries()) {
      const lk = k.toLowerCase();
      if (RELEVANT.has(lk)) snapshot[lk] = v;
    }
  };

  const emitIfChanged = (): void => {
    if (!snapshot['authorization']) return;
    const hash = JSON.stringify(snapshot);
    // eslint-disable-next-line security/detect-possible-timing-attacks -- not security-sensitive, change detection only
    if (hash === lastEmittedHash) return;
    lastEmittedHash = hash;
    const headers: AuthHeaders = {};
    for (const k of RELEVANT_AUTH_HEADERS) {
      const v = snapshot[k];
      if (v !== undefined) headers[k as RelevantAuthHeader] = v;
    }
    window.dispatchEvent(new CustomEvent(EVENT_AUTH, { detail: { headers } }));
  };

  const origFetch = window.fetch.bind(window);
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    try {
      if (isDiscordApi(input)) {
        const headers = new Headers(
          init?.headers ?? (input instanceof Request ? input.headers : undefined),
        );
        captureFromHeaders(headers);
        emitIfChanged();
      }
    } catch {
      // never throw from a wrapper
    }
    return origFetch(input as RequestInfo, init);
  };

  type XhrPriv = XMLHttpRequest & { __dpUrl?: string };
  const origOpen = XMLHttpRequest.prototype.open;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (
    this: XhrPriv,
    ...args: unknown[]
  ): void {
    const url = args[1];
    this.__dpUrl = typeof url === 'string' ? url : url instanceof URL ? url.toString() : '';
    return (origOpen as (...a: unknown[]) => void).apply(this, args);
  } as typeof XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.setRequestHeader = function (
    this: XhrPriv,
    name: string,
    value: string,
  ) {
    try {
      const url = this.__dpUrl ?? '';
      if (isDiscordApi(url) && RELEVANT.has(name.toLowerCase())) {
        snapshot[name.toLowerCase()] = value;
        emitIfChanged();
      }
    } catch {
      // never throw
    }
    return origSetHeader.call(this, name, value);
  };
})();
