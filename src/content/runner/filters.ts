import { dateToSnowflake, isLikelySnowflake } from '../api/snowflake.js';
import type { DiscordMessage } from '../api/types.js';
import type { Boundary } from '../../shared/types.js';

export type ParsedBoundary = bigint | null;

export const parseBoundary = (b: Boundary): ParsedBoundary => {
  if (b.kind === 'none') return null;
  if (b.kind === 'datetime') {
    const ms = Date.parse(b.iso);
    if (!Number.isFinite(ms)) return null;
    return dateToSnowflake(ms);
  }
  if (b.kind === 'messageId') {
    if (!isLikelySnowflake(b.id)) return null;
    return BigInt(b.id);
  }
  return null;
};

const ALLOWED_TYPES = new Set([0, 19, 20]);

export const candidate = (
  m: DiscordMessage,
  selfId: string,
  boundary: ParsedBoundary,
): boolean => {
  if (m.author.id !== selfId) return false;
  if (m.pinned) return false;
  if (!ALLOWED_TYPES.has(m.type)) return false;
  if (boundary !== null && BigInt(m.id) >= boundary) return false;
  return true;
};
