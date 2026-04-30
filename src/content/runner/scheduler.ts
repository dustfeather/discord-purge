import { RUN_CONFIG } from '../../shared/constants.js';

export const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException('aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export const jitteredSleep = (
  baseMs: number = RUN_CONFIG.baseDelayMs,
  signal?: AbortSignal,
): Promise<void> => {
  const jitter = baseMs * RUN_CONFIG.jitterRatio;
  const ms = Math.max(0, baseMs + (Math.random() * 2 - 1) * jitter);
  return sleep(ms, signal);
};

export const backoffMs = (attempt: number): number =>
  Math.min(RUN_CONFIG.backoffCapMs, 1000 * 2 ** attempt);

export const readRetryAfterMs = async (res: {
  headers: Headers;
  body?: unknown;
}): Promise<number> => {
  const header = (res.headers.get('retry-after') ?? '').trim();
  let seconds: number | undefined;
  if (header) {
    const n = Number(header);
    if (Number.isFinite(n)) seconds = n;
  }
  if (seconds === undefined && res.body) {
    const body = res.body as { retry_after?: unknown };
    if (typeof body.retry_after === 'number') seconds = body.retry_after;
  }
  const ms = (seconds ?? 5) * 1000;
  return Math.max(RUN_CONFIG.minRetryAfterMs, ms);
};
