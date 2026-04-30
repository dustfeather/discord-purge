export type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  discriminator: string;
};

export type DiscordRecipient = {
  id: string;
  username: string;
  global_name?: string | null;
};

export type DiscordChannel = {
  id: string;
  type: 1 | 3 | number;
  name?: string | null;
  recipients?: DiscordRecipient[];
};

export type DiscordMessage = {
  id: string;
  channel_id: string;
  type: number;
  pinned: boolean;
  author: { id: string };
  timestamp: string;
};

export type ApiResult<T> =
  | { status: number; ok: true; body: T; headers: Headers }
  | { status: number; ok: false; body: unknown; headers: Headers };
