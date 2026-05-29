// Thin wrapper around the JSON fetch pattern used throughout the UI: it
// stringifies the body, parses the JSON response, and throws an Error carrying
// the server's `error` message on any non-2xx status.

async function parseError(res: Response, url: string): Promise<never> {
  const body = await res.json().catch(() => ({} as { error?: string }));
  throw new Error(body.error || `Request to ${url} failed (${res.status})`);
}

export async function apiPost<T = any>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res, url);
  return res.json() as Promise<T>;
}

export async function apiGet<T = any>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) await parseError(res, url);
  return res.json() as Promise<T>;
}
