import { computed, nextTick } from 'vue';
import { useWallet } from 'solana-wallets-vue';
import type { Wallet as SuiWallet } from '@mysten/wallet-standard';
import { toast } from 'vue-sonner';
import { ApiError } from '@/lib/api';
import type { WalletMenuAdapter } from '@/components/WalletMenu.vue';
import { useSuiWallet } from '@/stores/useSuiWallet';
import { useWallets } from '@/stores/useWallets';
import { useAddWallet } from '@/composables/useAddWallet';

/**
 * Builds the chain-agnostic adapters that drive the connect/add-wallet menus.
 * Extracted so each chain's menu can be rendered independently (e.g. inside its
 * own "Your X wallets" card header).
 */
export function useWalletAdapters() {
  const {
    wallets: solWallets,
    publicKey,
    connected: solConnected,
    connecting: solConnecting,
    select: selectSol,
    connect: connectStore,
    disconnect: disconnectSol,
  } = useWallet();
  type SolWalletName = Parameters<typeof selectSol>[0];

  const sui = useSuiWallet();
  const wallets = useWallets();
  const { addSolanaWallet, addSuiWallet, adding } = useAddWallet();

  // Only offer wallets that can actually connect.
  const READY = new Set(['Installed', 'Loadable']);

  function fail(e: unknown, fallback: string): void {
    if (e instanceof ApiError && e.status === 409) {
      toast.info('That wallet is already in your list');
      return;
    }
    toast.error(e instanceof Error ? e.message : fallback);
  }

  async function connectSol(name: SolWalletName): Promise<void> {
    try {
      selectSol(name);
      await nextTick();
      await connectStore();
    } catch (e) {
      fail(e, 'Failed to connect Solana wallet');
    }
  }

  async function connectSui(w: SuiWallet): Promise<void> {
    try {
      await sui.connect(w);
    } catch (e) {
      fail(e, 'Failed to connect Sui wallet');
    }
  }

  async function addSol(): Promise<void> {
    try {
      await addSolanaWallet();
      toast.success('Solana wallet added');
    } catch (e) {
      fail(e, 'Could not add Solana wallet');
    }
  }

  async function addSui(): Promise<void> {
    try {
      await addSuiWallet();
      toast.success('Sui wallet added');
    } catch (e) {
      fail(e, 'Could not add Sui wallet');
    }
  }

  const solAdapter = computed<WalletMenuAdapter>(() => {
    const addr = publicKey.value?.toBase58() ?? null;
    return {
      asset: 'SOL',
      label: 'Solana',
      wallets: solWallets.value
        .filter((w) => READY.has(String(w.readyState)))
        .map((w) => ({ name: w.adapter.name, icon: w.adapter.icon, onSelect: () => connectSol(w.adapter.name) })),
      noWalletText: 'No Solana wallet detected',
      connected: solConnected.value,
      address: addr,
      authed: !!addr && wallets.byChain('sol').some((w) => w.address === addr),
      busy: solConnecting.value || adding.value,
      onSignIn: addSol,
      onDisconnect: () => void disconnectSol(),
      actionLabel: 'Add this wallet',
      actionDoneLabel: 'Added',
    };
  });

  const suiAdapter = computed<WalletMenuAdapter>(() => {
    const addr = sui.address.value;
    return {
      asset: 'SUI',
      label: 'Sui',
      wallets: sui.wallets.value.map((w) => ({ name: w.name, icon: w.icon, onSelect: () => connectSui(w) })),
      noWalletText: 'No Sui wallet detected',
      connected: !!sui.current.value,
      address: addr,
      authed: !!addr && wallets.byChain('sui').some((w) => w.address === addr),
      busy: sui.connecting.value || adding.value,
      onSignIn: addSui,
      onDisconnect: () => void sui.disconnect(),
      actionLabel: 'Add this wallet',
      actionDoneLabel: 'Added',
    };
  });

  return { solAdapter, suiAdapter };
}
