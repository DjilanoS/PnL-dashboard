import { ref } from 'vue';
import type { AddWalletRequest, Chain, WalletDTO, WalletsResponse } from '@pnl/types';
import { api } from '@/lib/api';

/**
 * The user's per-chain "your wallets" list (module-level singleton, no Pinia).
 * Seeded by useAuth().hydrate() from GET /auth/me, refreshed via GET /wallets.
 */
const wallets = ref<WalletsResponse>({ sol: [], sui: [] });
const loading = ref(false);
const loaded = ref(false);

/** Replace the whole list (used when hydrating from /auth/me). */
function setWallets(next: WalletsResponse): void {
  wallets.value = { sol: next.sol ?? [], sui: next.sui ?? [] };
  loaded.value = true;
}

async function fetchWallets(force = false): Promise<void> {
  if (loaded.value && !force) return;
  loading.value = true;
  try {
    setWallets(await api.get<WalletsResponse>('/wallets'));
  } finally {
    loading.value = false;
  }
}

async function addWallet(input: AddWalletRequest): Promise<WalletDTO> {
  const created = await api.post<WalletDTO>('/wallets', input);
  const key = created.chain === 'sol' ? 'sol' : 'sui';
  wallets.value = { ...wallets.value, [key]: [...wallets.value[key], created] };
  return created;
}

async function removeWallet(id: string): Promise<void> {
  await api.del(`/wallets/${id}`);
  wallets.value = {
    sol: wallets.value.sol.filter((w) => w.id !== id),
    sui: wallets.value.sui.filter((w) => w.id !== id),
  };
}

function byChain(chain: Chain): WalletDTO[] {
  return chain === 'sol' ? wallets.value.sol : wallets.value.sui;
}

/** Drop all wallet state (on logout). */
function clear(): void {
  wallets.value = { sol: [], sui: [] };
  loaded.value = false;
}

export function useWallets() {
  return { wallets, loading, loaded, setWallets, fetchWallets, addWallet, removeWallet, byChain, clear };
}
