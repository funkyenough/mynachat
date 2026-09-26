// Client-side fetch helper. "Failed to fetch" (a TypeError) means the request never got an
// HTTP response: the dev server restarted or is down. Say that instead of the raw message.
export class ApiError extends Error {
  constructor(message: string, public status: number, public data: any) {
    super(message);
  }
}

export async function api<T = any>(url: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("サーバーに接続できません / Can't reach the server. Is it running? Try again.", 0, null);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.detail ? ` (${data.detail})` : "";
    throw new ApiError(`${data?.error ?? `HTTP ${res.status}`}${detail}`, res.status, data);
  }
  return data as T;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
