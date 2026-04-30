export const API_BASE = 'https://discord.com/api';
export const API_VERSION = 'v9';
export const API_ROOT = `${API_BASE}/${API_VERSION}`;

export const DISCORD_EPOCH = 1420070400000n; // 2015-01-01T00:00:00Z

export const ROUTE_DM_PATH_PREFIX = '/channels/@me/';
export const ROUTE_DM_REGEX = /^\/channels\/@me\/(\d{15,25})(?:\/.*)?$/;

export const RUN_CONFIG = {
  baseDelayMs: 3500,
  jitterRatio: 0.3,
  maxAttempts: 5,
  minRetryAfterMs: 5000,
  backoffCapMs: 30000,
} as const;

export const STORAGE_KEYS = {
  panelPosition: 'panel.position',
  panelCollapsed: 'panel.collapsed',
  log: 'log.lines',
  stats: 'stats.lastRun',
} as const;

export const EVENT_AUTH = 'discord-purge:auth';
export const EVENT_LOCATION = 'discord-purge:locationchange';

export const RELEVANT_AUTH_HEADERS = [
  'authorization',
  'x-super-properties',
  'x-discord-locale',
  'x-discord-timezone',
  'x-debug-options',
] as const;

export type RelevantAuthHeader = (typeof RELEVANT_AUTH_HEADERS)[number];
