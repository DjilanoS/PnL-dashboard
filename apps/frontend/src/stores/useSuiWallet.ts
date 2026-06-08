import { ref, shallowRef } from 'vue';
import { getWallets } from '@mysten/wallet-standard';
import type { Wallet, WalletAccount } from '@mysten/wallet-standard';

/**
 * DIY Sui wallet adapter — there is no maintained Vue-native Sui wallet library,
 * so this wraps the Wallet Standard directly. Module-level reactive singleton
 * (a Pinia-less store). Detects installed Sui wallets, connects, persists the
 * last-used wallet for silent reconnect, and signs personal messages for login.
 */
const SIGN_FEATURE = 'sui:signPersonalMessage';
const CONNECT_FEATURE = 'standard:connect';
const DISCONNECT_FEATURE = 'standard:disconnect';
const EVENTS_FEATURE = 'standard:events';
const LAST_WALLET_KEY = 'sui.lastWallet';

const registry = getWallets();
const wallets = shallowRef<Wallet[]>([]);
const current = shallowRef<Wallet | null>(null);
const address = ref<string | null>(null);
const connecting = ref(false);

let offChange: (() => void) | null = null;

function isSuiWallet(w: Wallet): boolean {
  return SIGN_FEATURE in w.features;
}

function refreshWallets(): void {
  wallets.value = registry.get().filter(isSuiWallet);
}

function attachChangeListener(w: Wallet): void {
  offChange?.();
  const events = w.features[EVENTS_FEATURE] as
    | { on: (event: 'change', cb: (p: { accounts?: readonly WalletAccount[] }) => void) => () => void }
    | undefined;
  if (!events) return;
  offChange = events.on('change', ({ accounts }) => {
    if (accounts) {
      address.value = accounts[0]?.address ?? null;
      if (!address.value) current.value = null;
    }
  });
}

async function connect(wallet: Wallet): Promise<void> {
  connecting.value = true;
  try {
    const feature = wallet.features[CONNECT_FEATURE] as {
      connect: () => Promise<{ accounts: readonly WalletAccount[] }>;
    };
    const res = await feature.connect();
    current.value = wallet;
    address.value = (wallet.accounts[0] ?? res.accounts[0])?.address ?? null;
    localStorage.setItem(LAST_WALLET_KEY, wallet.name);
    attachChangeListener(wallet);
  } finally {
    connecting.value = false;
  }
}

async function disconnect(): Promise<void> {
  const wallet = current.value;
  if (wallet && DISCONNECT_FEATURE in wallet.features) {
    try {
      await (wallet.features[DISCONNECT_FEATURE] as { disconnect: () => Promise<void> }).disconnect();
    } catch {
      /* ignore */
    }
  }
  offChange?.();
  offChange = null;
  current.value = null;
  address.value = null;
  localStorage.removeItem(LAST_WALLET_KEY);
}

/** Sign `text` with the connected Sui wallet. Returns the wallet's base64 signature. */
async function signPersonalMessage(text: string): Promise<{ signature: string; bytes: string }> {
  const wallet = current.value;
  const account = wallet?.accounts[0];
  if (!wallet || !account) throw new Error('No Sui wallet connected');
  const feature = wallet.features[SIGN_FEATURE] as {
    signPersonalMessage: (input: {
      account: WalletAccount;
      message: Uint8Array;
    }) => Promise<{ signature: string; bytes: string }>;
  };
  return feature.signPersonalMessage({ account, message: new TextEncoder().encode(text) });
}

/** Silently restore a previously authorized wallet (no user prompt). */
function tryAutoReconnect(): void {
  if (current.value) return;
  const name = localStorage.getItem(LAST_WALLET_KEY);
  if (!name) return;
  const wallet = wallets.value.find((w) => w.name === name);
  if (wallet && wallet.accounts.length > 0) {
    current.value = wallet;
    address.value = wallet.accounts[0]?.address ?? null;
    attachChangeListener(wallet);
  }
}

// Initialize once at module load. Wallet extensions inject asynchronously, so
// refresh + retry reconnect whenever a wallet (un)registers.
refreshWallets();
tryAutoReconnect();
registry.on('register', () => {
  refreshWallets();
  tryAutoReconnect();
});
registry.on('unregister', refreshWallets);

export function useSuiWallet() {
  return { wallets, current, address, connecting, connect, disconnect, signPersonalMessage };
}
