import type { Asset } from './order';

/** A single point on the portfolio-value (NAV) time series. */
export interface NavPoint {
  /** ISO-8601 date (UTC day) of the snapshot. */
  date: string;
  /** Total portfolio value in USD at that date. */
  totalValueUsd: number;
  /** Per-asset value breakdown at that date. */
  breakdown: { asset: Asset; valueUsd: number }[];
}

export type NavRange = '7d' | '30d' | '90d' | '1y' | 'all';

export interface TimeseriesResponse {
  range: NavRange;
  points: NavPoint[];
}
