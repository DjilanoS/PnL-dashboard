import type { Chain } from '@pnl/types';

/** Block-explorer URL for an account/address on the given chain. */
export function accountExplorerUrl(chain: Chain, address: string): string {
  return chain === 'sol'
    ? `https://solscan.io/account/${address}`
    : `https://suiscan.xyz/mainnet/account/${address}`;
}
