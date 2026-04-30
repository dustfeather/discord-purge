import { DISCORD_EPOCH } from '../../shared/constants.js';

export const dateToSnowflake = (ms: number): bigint => {
  return BigInt(ms - Number(DISCORD_EPOCH)) << 22n;
};

export const snowflakeToMs = (id: bigint | string): number => {
  const b = typeof id === 'bigint' ? id : BigInt(id);
  return Number((b >> 22n) + DISCORD_EPOCH);
};

export const isLikelySnowflake = (s: string): boolean => /^\d{15,25}$/.test(s);
