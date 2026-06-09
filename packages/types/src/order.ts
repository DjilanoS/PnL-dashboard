/** The two chains this dashboard tracks. */
export type Chain = 'sol' | 'sui';

/**
 * A token's display ticker, e.g. "SOL", "SUI", "JUP", "USDC". Previously a
 * `'SOL' | 'SUI'` union; now any token symbol. The narrow native literals are
 * still valid `Asset`s, so existing call sites that pass `'SOL'`/`'SUI'` keep
 * working. A token's *identity* is `(chain, address)` (see {@link TokenRef}).
 */
export type Asset = string;

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
  /** Token address (SPL mint / Sui coin type). Native coins use canonical addresses. */
  address: string;
  /** Display ticker (denormalized), e.g. "SOL", "JUP". */
  asset: Asset;
  /** On-chain decimals of the token. */
  decimals: number;
  /** Token full name, if known (denormalized). */
  name?: string;
  /** Token logo URL, if known (denormalized). */
  image?: string;
  side: OrderSide;
  /** Quantity of the token, in whole coins (UI amount, not raw). */
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
