/**
 * Tiny typed fetch wrapper. Attaches the JWT from localStorage and surfaces
 * non-2xx responses as {@link ApiError}. Reads the token directly from storage
 * (not from useAuth) to avoid a circular import.
 */
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const TOKEN_KEY = 'pnl.jwt';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Listeners notified on a 401 so the app can log out / redirect. */
const unauthorizedHandlers = new Set<() => void>();
export function onUnauthorized(handler: () => void): () => void {
  unauthorizedHandlers.add(handler);
  return () => unauthorizedHandlers.delete(handler);
}

/** Listeners notified when an endpoint hands back a refreshed JWT (sliding session). */
const tokenRefreshHandlers = new Set<(token: string) => void>();
export function onTokenRefresh(handler: (token: string) => void): () => void {
  tokenRefreshHandlers.add(handler);
  return () => tokenRefreshHandlers.delete(handler);
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...authHeaders() };
  // Only declare a JSON body when we actually send one. A bodyless request
  // (DELETE/GET) carrying Content-Type: application/json makes Fastify reject it
  // with FST_ERR_CTP_EMPTY_JSON_BODY.
  if (init.body != null) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
  });

  // A protected endpoint (e.g. /auth/me) may hand back a fresh JWT to extend the
  // session. Persist it immediately so the next request carries the slid-forward
  // token, then notify subscribers to sync reactive auth state.
  const refreshed = res.headers.get('x-refreshed-token');
  if (refreshed) {
    localStorage.setItem(TOKEN_KEY, refreshed);
    tokenRefreshHandlers.forEach((h) => h(refreshed));
  }

  if (res.status === 401) {
    unauthorizedHandlers.forEach((h) => h());
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const message = body?.message ?? body?.error ?? res.statusText;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data === undefined ? undefined : JSON.stringify(data) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
