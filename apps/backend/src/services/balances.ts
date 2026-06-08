import type { Asset } from '@pnl/types';
import { solanaRpcUrl, type AppConfig } from '../config/env';
import { getSuiClient } from './suiParser';

/** Live on-chain SOL balance (best-effort; null on failure). */
export async function getSolBalance(config: AppConfig, address: string): Promise<number | null> {
  try {
    const res = await fetch(solanaRpcUrl(config), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] }),
      // Don't follow redirects: a (possibly user-supplied) RPC URL must not be
      // able to bounce this server-side request to an internal target.
      redirect: 'manual',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: { value?: number } };
    return data.result?.value != null ? data.result.value / 1e9 : null;
  } catch {
    return null;
  }
}

/** Live on-chain SUI balance (best-effort; null on failure). */
export async function getSuiBalance(config: AppConfig, address: string): Promise<number | null> {
  try {
    const bal = await getSuiClient(config).getBalance({ owner: address });
    return Number(bal.totalBalance) / 1e9;
  } catch {
    return null;
  }
}

/** Best-effort live balances summed across all of a user's tracked wallets per chain. */
export async function getWalletBalances(
  config: AppConfig,
  solAddrs: string[],
  suiAddrs: string[],
): Promise<Record<Asset, number | null>> {
  const sumChain = async (
    addrs: string[],
    one: (config: AppConfig, address: string) => Promise<number | null>,
  ): Promise<number | null> => {
    if (addrs.length === 0) return null;
    const vals = await Promise.all(addrs.map((a) => one(config, a)));
    const known = vals.filter((v): v is number => v != null);
    // null only when every lookup failed — keeps "no data" distinct from "0 held".
    return known.length ? known.reduce((s, v) => s + v, 0) : null;
  };

  const [SOL, SUI] = await Promise.all([
    sumChain(solAddrs, getSolBalance),
    sumChain(suiAddrs, getSuiBalance),
  ]);
  return { SOL, SUI };
}
