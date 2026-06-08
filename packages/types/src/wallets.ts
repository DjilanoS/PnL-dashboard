import type { Chain } from './order';

/** A wallet the user has added to their per-chain "your wallets" list. */
export interface WalletDTO {
  id: string;
  chain: Chain;
  address: string;
  /** Optional user-given nickname. */
  label: string | null;
  /** ISO-8601 timestamp the ownership signature was verified. */
  verifiedAt: string;
}

/** Body for POST /wallets/nonce — request a challenge to sign. */
export interface WalletNonceRequest {
  chain: Chain;
  address: string;
}

export interface WalletNonceResponse {
  /** Random single-use nonce to sign. The exact message signed is */
  /** `Add wallet to PnL Dashboard\nnonce: ${nonce}` (see backend auth service). */
  nonce: string;
}

/** Body for POST /wallets — prove ownership of `address` and add it. */
export interface AddWalletRequest {
  chain: Chain;
  address: string;
  /** base64-encoded signature bytes. */
  signature: string;
  nonce: string;
  label?: string;
}

/** The user's tracked wallets grouped by chain (GET /wallets). */
export interface WalletsResponse {
  sol: WalletDTO[];
  sui: WalletDTO[];
}
