import { ref } from 'vue';
import { useWallet } from 'solana-wallets-vue';
import { addWalletMessage } from '@pnl/types';
import type { Chain, WalletDTO, WalletNonceResponse } from '@pnl/types';
import { api } from '@/lib/api';
import { useWallets } from '@/stores/useWallets';
import { useSuiWallet } from '@/stores/useSuiWallet';

const adding = ref(false);

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Prove ownership of `address` (request a nonce → sign it) and add it to the
 * user's per-chain wallet list. Mirrors the old login flow's signing, minus the
 * session: Solana returns raw bytes we base64-encode; Sui's signature is already
 * base64.
 */
async function run(
  chain: Chain,
  address: string,
  label: string | undefined,
  sign: (message: string) => Promise<string>,
): Promise<WalletDTO> {
  adding.value = true;
  try {
    const { nonce } = await api.post<WalletNonceResponse>('/wallets/nonce', { chain, address });
    const signature = await sign(addWalletMessage(nonce));
    return await useWallets().addWallet({ chain, address, signature, nonce, label });
  } finally {
    adding.value = false;
  }
}

async function addSolanaWallet(label?: string): Promise<WalletDTO> {
  const { publicKey, signMessage } = useWallet();
  if (!publicKey.value) throw new Error('Connect a Solana wallet first');
  const sign = signMessage.value;
  if (!sign) throw new Error('This wallet cannot sign messages');
  return run('sol', publicKey.value.toBase58(), label, async (message) =>
    toBase64(await sign(new TextEncoder().encode(message))),
  );
}

async function addSuiWallet(label?: string): Promise<WalletDTO> {
  const { address, signPersonalMessage } = useSuiWallet();
  if (!address.value) throw new Error('Connect a Sui wallet first');
  return run('sui', address.value, label, async (message) => (await signPersonalMessage(message)).signature);
}

export function useAddWallet() {
  return { adding, addSolanaWallet, addSuiWallet };
}
