/** The two chains / native assets this dashboard tracks. */
export type Chain = 'sol' | 'sui';

/** Tracked native asset. Maps 1:1 with {@link Chain}. */
export type Asset = 'SOL' | 'SUI';

/** Whether the tracked asset was acquired (buy) or disposed (sell). */
export type OrderSide = 'buy' | 'sell';

/** How an order entered the ledger. */
export type OrderSource = 'scan' | 'tx' | 'manual';

/** The counter-asset an order was traded against (informational). */
export interface QuoteLeg {
  /** e.g. "USDC", "USD", "USDT". */
  symbol: string;
  /** Quantity of the quote asset moved. */
  amount: number;
}

/** Fields shared by manual input, parsed previews, and persisted orders. */
export interface OrderCore {
  chain: Chain;
  asset: Asset;
  side: OrderSide;
  /** Quantity of the tracked asset (SOL/SUI), in whole coins. */
  amount: number;
  /** Executed USD price per coin at trade time. */
  priceUsd: number;
  /** What the trade was settled against (optional, informational). */
  quote?: QuoteLeg;
  /** Trading/protocol fee in USD (folded into cost basis / proceeds). */
  feeUsd: number;
  /** Network gas in USD (folded into cost basis / proceeds). */
  gasUsd: number;
  /** ISO-8601 timestamp of the trade. */
  timestamp: string;
}

/** Payload to create a manual order (no on-chain tx). */
export interface ManualOrderInput extends OrderCore {
  source?: 'manual';
}

/** A persisted order returned by the API. */
export interface Order extends OrderCore {
  id: string;
  source: OrderSource;
  /** On-chain signature/digest; null for manual orders. Unique when present. */
  txSignature: string | null;
  createdAt: string;
}
