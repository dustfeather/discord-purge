import type { RelevantAuthHeader } from './constants.js';

export type AuthHeaders = Partial<Record<RelevantAuthHeader, string>>;

export type RunPhase = 'idle' | 'collecting' | 'deleting';

export type RunStats = {
  scanned: number;
  deleted: number;
  skipped: number;
  alreadyGone: number;
  forbidden: number;
  errors: number;
  phase: RunPhase;
  /** Pages walked during the collect phase (1-indexed). */
  collectingPage: number;
  /** Final candidate count once collect phase completes (0 until then). */
  totalCandidates: number;
  /** Epoch ms when the delete phase began (null while collecting / idle). */
  phaseStartedAt: number | null;
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
