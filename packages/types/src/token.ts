import type { Chain } from './order';

/**
 * Canonical on-chain addresses for the native coins. A native coin is modeled
 * as just another token so the whole stack can key on `(chain, address)`.
 */
export const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112'; // wSOL mint
export const NATIVE_SUI_TYPE = '0x2::sui::SUI';

/** Stable identity of a token: chain + on-chain address (SPL mint / Sui coin type). */
export interface TokenRef {
  chain: Chain;
  /** Solana SPL mint, or Sui coin type. Native coins use the canonical addresses above. */
  address: string;
}

/** Denormalized display metadata for a token (stored on each order, returned in DTOs). */
export interface TokenMeta extends TokenRef {
  /** Ticker, e.g. "SOL", "JUP", "USDC". Always present (falls back to a short address). */
  symbol: string;
  /** Full name if known. */
  name?: string;
  /** Logo URL if known. */
  image?: string;
  /** On-chain decimals (9 for SOL / native SUI, varies for SPL & Sui coins). */
  decimals: number;
}

/** True if a `(chain, address)` pair is the chain's native coin. */
export function isNativeToken(chain: Chain, address: string): boolean {
  if (chain === 'sol') return address === NATIVE_SOL_MINT;
  return /^0x0*2::sui::SUI$/.test(address);
}

/** The canonical native token address for a chain. */
export function nativeTokenAddress(chain: Chain): string {
  return chain === 'sol' ? NATIVE_SOL_MINT : NATIVE_SUI_TYPE;
}

/** The canonical native `TokenRef` for a chain. */
export function nativeTokenRef(chain: Chain): TokenRef {
  return { chain, address: nativeTokenAddress(chain) };
}

/** Stable map key for a token, `${chain}:${address}`. */
export function tokenKey(chain: Chain, address: string): string {
  return `${chain}:${address}`;
}

/** A short, human-friendly fallback label for an address with no known symbol. */
export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}
