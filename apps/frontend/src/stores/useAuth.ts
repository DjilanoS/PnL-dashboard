import { computed, ref } from 'vue';
import type { AuthUser, MeResponse } from '@pnl/types';
import { TOKEN_KEY, api, onUnauthorized, onTokenRefresh } from '@/lib/api';
import { useWallets } from '@/stores/useWallets';

const USER_KEY = 'pnl.user';

function readUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

// Module-level reactive singletons (shared across all importers — no Pinia).
const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
const user = ref<AuthUser | null>(readUser());

const isAuthenticated = computed(() => !!token.value);

function persistUser(next: AuthUser | null): void {
  user.value = next;
  if (next) localStorage.setItem(USER_KEY, JSON.stringify(next));
  else localStorage.removeItem(USER_KEY);
}

/** Store just the JWT (the Discord callback hands us the token before the user). */
function setToken(newToken: string): void {
  token.value = newToken;
  localStorage.setItem(TOKEN_KEY, newToken);
}

function setSession(newToken: string, newUser: AuthUser): void {
  setToken(newToken);
  persistUser(newUser);
}

/**
 * Pull identity + tracked wallets from the API — the source of truth after a
 * Discord login or a page reload. Seeds the wallets store in the same round-trip.
 */
async function hydrate(): Promise<void> {
  const me = await api.get<MeResponse>('/auth/me');
  persistUser(me.user);
  useWallets().setWallets(me.wallets);
}

function logout(): void {
  token.value = null;
  persistUser(null);
  localStorage.removeItem(TOKEN_KEY);
  useWallets().clear();
}

// Any 401 from the API clears the session.
onUnauthorized(logout);

// A refreshed JWT (e.g. from /auth/me) slides the session forward; keep the
// reactive token in sync — the api layer already persisted it to storage.
onTokenRefresh((next) => {
  token.value = next;
});

export function useAuth() {
  return { token, user, isAuthenticated, setToken, setSession, hydrate, logout };
}
