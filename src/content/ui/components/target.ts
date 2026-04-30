import type { ApiClient } from '../../api/client.js';
import type { DiscordChannel } from '../../api/types.js';
import { h } from '../h.js';

export type TargetApi = {
  el: HTMLElement;
  setChannel(channel: DiscordChannel | null): void;
  refresh(channelId: string, api: ApiClient): Promise<DiscordChannel | null>;
};

const describe = (c: DiscordChannel): string => {
  if (c.type === 1) {
    const r = c.recipients?.[0];
    const name = r ? `@${r.global_name ?? r.username}` : 'unknown user';
    return `DM with ${name}`;
  }
  if (c.type === 3) {
    const names = (c.recipients ?? []).map((r) => `@${r.global_name ?? r.username}`).join(', ');
    return `Group DM (${(c.recipients ?? []).length + 1} members)${names ? ': ' + names : ''}`;
  }
  return c.name ?? `Channel ${c.id}`;
};

export const renderTarget = (): TargetApi => {
  const text = h('div', { className: 'target-line' }, '—');
  const id = h('div', { className: 'target-line id' }, '');
  const el = h('div', null, [text, id]);

  const api: TargetApi = {
    el,
    setChannel(c) {
      if (!c) {
        text.textContent = '—';
        id.textContent = '';
        return;
      }
      text.textContent = describe(c);
      id.textContent = c.id;
    },
    async refresh(channelId, client) {
      try {
        const c = await client.getChannel(channelId);
        api.setChannel(c);
        return c;
      } catch {
        text.textContent = 'Channel info unavailable';
        id.textContent = channelId;
        return null;
      }
    },
  };
  return api;
};
