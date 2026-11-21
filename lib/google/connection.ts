export type Connection = { connected: boolean; expired: boolean };

export function connectionOf(tokens: { refresh_token?: string; refused_at?: number } | null): Connection {
  const linked = Boolean(tokens?.refresh_token);
  const expired = linked && Boolean(tokens?.refused_at);
  return { connected: linked && !expired, expired };
}
