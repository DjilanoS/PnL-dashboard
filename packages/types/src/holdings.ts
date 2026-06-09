import type { Asset, Chain } from './order';

/** A single tracked position with live valuation. */
export interface Holding {
  chain: Chain;
  /** Token address (SPL mint / Sui coin type). */
  address: string;
  /** Display ticker. */
  asset: Asset;
  /** Token full name, if known. */
  name?: string;
  /** Token logo URL, if known. */
  image?: string;
  /** On-chain decimals. */
  decimals: number;
  /** On-chain wallet balance of the coin (whole coins), if a wallet is linked. */
  walletBalance: number | null;
  /** Coins held per the order ledger (buys - sells). */
  ledgerQty: number;
  /** Weighted-average cost per coin. */
  avgCost: number;
  /** Remaining cost basis (ledgerQty * avgCost). */
  costBasis: number;
  /** Latest USD price per coin. */
  currentPrice: number;
  /** ledgerQty * currentPrice. */
  valueUsd: number;
  /** (currentPrice - avgCost) * ledgerQty. */
  unrealized: number;
  /** Share of total portfolio value (0..1). */
  allocation: number;
}

export interface HoldingsResponse {
  holdings: Holding[];
  totalValueUsd: number;
}
