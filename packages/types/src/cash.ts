/**
 * Manual cash (USDC) balance adjustment. The USDC position is auto-derived from
 * trades; an adjustment records a deposit/withdrawal that isn't a trade so the
 * balance can be corrected. Amount is signed USD: positive = deposit, negative
 * = withdrawal. Adjustments accumulate.
 */
export interface CashAdjustment {
  id: string;
  amount: number;
  note?: string;
  /** ISO-8601 timestamp the adjustment applies from. */
  timestamp: string;
  createdAt: string;
}

/** Payload to create a cash adjustment. */
export interface CashAdjustmentInput {
  amount: number;
  note?: string;
  /** Defaults to now server-side. */
  timestamp?: string;
}
