import type { Asset, Chain } from './order';

/** Per-token PnL, derived by replaying the order ledger (weighted-average cost). */
export interface AssetPnl {
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
  /** Coins currently held (sum of buys minus sells). */
  held: number;
  /** Weighted-average cost per coin (incl. fees/gas on buys). */
  avgCost: number;
  /** Remaining cost basis of held coins (held * avgCost). */
  costBasis: number;
  /** Latest USD price per coin. */
  currentPrice: number;
  /** Current market value of held coins. */
  marketValue: number;
  /** Realized PnL from all sells so far, in USD. */
  realized: number;
  /** Unrealized PnL on held coins, in USD. */
  unrealized: number;
  /** Total invested across buys (incl. fees), in USD. */
  invested: number;
  /** Average buy price (Σ buy notional incl. fees / Σ buy qty). */
  avgBuy: number;
  /** Average sell price (Σ sell notional net fees / Σ sell qty), or 0 if none. */
  avgSell: number;
}

/** Portfolio-wide PnL summary. */
export interface PnlSummary {
  realized: number;
  unrealized: number;
  /** realized + unrealized. */
  total: number;
  /** Total USD put into open positions (cost basis of current holdings). */
  invested: number;
  /** total / invested (0 when nothing invested). */
  roi: number;
  /** Portfolio-weighted average buy price across assets is not meaningful; */
  /** these aggregate per-asset values for the cards. */
  perAsset: AssetPnl[];
}

/** Time window the hero PnL card can be scoped to. */
export type PnlRange = '24h' | '30d' | 'lifetime';
