import { API_ROOT } from '../../shared/constants.js';
import type { AuthHeaders } from '../../shared/types.js';
import type { ApiResult, DiscordChannel, DiscordMessage, DiscordUser } from './types.js';

export type ApiClient = {
  getMe(): Promise<DiscordUser>;
  getChannel(id: string): Promise<DiscordChannel>;
  listMessages(
    channelId: string,
    opts: { limit: number; before?: string },
  ): Promise<DiscordMessage[]>;
  deleteMessage(channelId: string, messageId: string): Promise<ApiResult<void>>;
};

export type CreateClientArgs = {
  getAuth: () => AuthHeaders | null;
  runId: string;
};

export const createApiClient = ({ getAuth, runId }: CreateClientArgs): ApiClient => {
  const call = async (path: string, init: RequestInit = {}): Promise<ApiResult<unknown>> => {
    const auth = getAuth();
    if (!auth?.authorization) throw new Error('no-auth');

    const headers = new Headers(init.headers ?? {});
    for (const [k, v] of Object.entries(auth)) {
      if (v) headers.set(k, v);
    }
    headers.set('X-Discord-Purge-Run', runId);

    const res = await fetch(`${API_ROOT}${path}`, { ...init, headers, credentials: 'include' });
    let body: unknown;
    if (res.status !== 204) {
      const text = await res.text();
      try {
        body = text ? JSON.parse(text) : undefined;
      } catch {
        body = text;
      }
    }
    if (res.ok) {
      return { status: res.status, ok: true, body: body as never, headers: res.headers };
    }
    return { status: res.status, ok: false, body, headers: res.headers };
  };

  const callJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const res = await call(path, init);
    if (!res.ok) {
      throw new Error(`Discord API ${res.status} on ${path}`);
    }
    return res.body as T;
  };

  return {
    getMe: () => callJson<DiscordUser>('/users/@me'),
    getChannel: (id) => callJson<DiscordChannel>(`/channels/${encodeURIComponent(id)}`),
    listMessages: async (channelId, { limit, before }) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (before) params.set('before', before);
      return callJson<DiscordMessage[]>(
        `/channels/${encodeURIComponent(channelId)}/messages?${params.toString()}`,
      );
    },
    deleteMessage: (channelId, messageId) =>
      call(
        `/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
        { method: 'DELETE' },
      ) as Promise<ApiResult<void>>,
  };
};
