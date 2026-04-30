import { RUN_CONFIG } from '../../shared/constants.js';
import type { ApiClient } from '../api/client.js';
import type { DiscordUser } from '../api/types.js';
import type { Logger } from '../log/log.js';
import type { Boundary, RunStats } from '../../shared/types.js';
import { backoffMs, jitteredSleep, readRetryAfterMs, sleep } from './scheduler.js';
import { candidate, parseBoundary } from './filters.js';

export type RunArgs = {
  channelId: string;
  boundary: Boundary;
  api: ApiClient;
  logger: Logger;
  signal: AbortSignal;
  onStats?: (s: RunStats) => void;
};

export const emptyStats = (): RunStats => ({
  scanned: 0,
  deleted: 0,
  skipped: 0,
  alreadyGone: 0,
  forbidden: 0,
  errors: 0,
});

export const runPurge = async ({
  channelId,
  boundary,
  api,
  logger,
  signal,
  onStats,
}: RunArgs): Promise<RunStats> => {
  const stats = emptyStats();
  const emit = () => onStats?.({ ...stats });

  const boundarySnowflake = parseBoundary(boundary);
  const me: DiscordUser = await api.getMe();
  logger.append(`run: target channel=${channelId} as user=${me.id}`);
  if (boundarySnowflake !== null) {
    logger.append(`run: boundary snowflake = ${boundarySnowflake.toString()}`);
  }

  let cursor: string | undefined;
  while (!signal.aborted) {
    let page: Awaited<ReturnType<ApiClient['listMessages']>>;
    try {
      page = await api.listMessages(channelId, cursor ? { limit: 100, before: cursor } : { limit: 100 });
    } catch (e) {
      stats.errors++;
      logger.append(`list failed: ${(e as Error).message}`);
      emit();
      return stats;
    }
    if (page.length === 0) {
      logger.append('done: history exhausted');
      break;
    }
    cursor = page[page.length - 1]!.id;
    stats.scanned += page.length;

    const targets = page.filter((m) => candidate(m, me.id, boundarySnowflake));
    const skippedThisPage = page.length - targets.length;
    stats.skipped += skippedThisPage;
    emit();

    for (const m of targets) {
      if (signal.aborted) {
        logger.append('aborted');
        emit();
        return stats;
      }
      await jitteredSleep(RUN_CONFIG.baseDelayMs, signal).catch(() => undefined);
      if (signal.aborted) return stats;

      let attempt = 0;
      let succeeded = false;
      while (attempt < RUN_CONFIG.maxAttempts && !signal.aborted) {
        const res = await api.deleteMessage(channelId, m.id);
        if (res.status === 204) {
          stats.deleted++;
          succeeded = true;
          emit();
          break;
        }
        if (res.status === 404) {
          stats.alreadyGone++;
          succeeded = true;
          emit();
          break;
        }
        if (res.status === 403) {
          stats.forbidden++;
          logger.append(`forbidden ${m.id}`);
          succeeded = true;
          emit();
          break;
        }
        if (res.status === 429) {
          const wait = await readRetryAfterMs({ headers: res.headers, body: res.body });
          logger.append(`rate-limited; sleeping ${wait} ms`);
          await sleep(wait, signal).catch(() => undefined);
          attempt++;
          continue;
        }
        if (res.status >= 500) {
          const wait = backoffMs(attempt);
          logger.append(`server ${res.status}; backoff ${wait} ms`);
          await sleep(wait, signal).catch(() => undefined);
          attempt++;
          continue;
        }
        stats.errors++;
        logger.append(`unexpected ${res.status} for ${m.id}`);
        succeeded = true;
        emit();
        break;
      }
      if (!succeeded) {
        stats.errors++;
        logger.append(`gave up on ${m.id} after ${RUN_CONFIG.maxAttempts} attempts`);
        emit();
      }
    }
  }
  return stats;
};
