import type { LogLine, RunStats } from './types.js';

export type ContentToBg =
  | { kind: 'log:append'; line: LogLine }
  | { kind: 'log:read' }
  | { kind: 'log:clear' }
  | { kind: 'stats:save'; stats: RunStats }
  | { kind: 'stats:read' }
  | { kind: 'panel:setPosition'; x: number; y: number }
  | { kind: 'panel:getPosition' }
  | { kind: 'panel:setCollapsed'; collapsed: boolean }
  | { kind: 'panel:getCollapsed' }
  | { kind: 'panel:setHidden'; hidden: boolean }
  | { kind: 'panel:getHidden' };

export type BgToContent = { kind: 'panel:toggleVisibility' };

export type BgResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };
