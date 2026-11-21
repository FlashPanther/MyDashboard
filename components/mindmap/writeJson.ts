export async function writeJson(
  url: string,
  method: 'POST' | 'PUT' | 'DELETE',
  payload: object = {},
  keepalive = false,
): Promise<{ status: number; body: unknown }> {
  try {
    const response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive,
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch {
    return { status: 0, body: null };
  }
}
