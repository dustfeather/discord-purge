import type { RelevantAuthHeader } from './constants.js';

export type AuthHeaders = Partial<Record<RelevantAuthHeader, string>>;

export type RunStats = {
  scanned: number;
  deleted: number;
  skipped: number;
  alreadyGone: number;
  forbidden: number;
  errors: number;
};

export type LogLine = {
  ts: number;
  msg: string;
};

export type Boundary =
  | { kind: 'none' }
  | { kind: 'datetime'; iso: string }
  | { kind: 'messageId'; id: string };

export type PanelState =
  | 'loading-auth'
  | 'ready'
  | 'running'
  | 'cancelling'
  | 'done'
  | 'error';
