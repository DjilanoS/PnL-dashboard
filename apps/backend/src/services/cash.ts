import type { LedgerEntry } from './pnlEngine';

/**
 * Synthetic USDC cash position.
 *
 * The account is modeled as funded by USDC: buying an asset spends USDC, selling
 * one refills it. Deposits/withdrawals aren't tracked, so an *implicit* initial
 * deposit equal to the peak capital ever deployed lifts the lowest running
 * balance to 0 — the cash balance is therefore never negative, and the books
 * close exactly: `cryptoValue + usdcBalance === deposit + totalPnL`.
 *
 * USDC carries no PnL of its own (price $1, no realized/unrealized), so it is
 * computed here and injected as a holding/NAV leg rather than routed through the
 * PnL engine — keeping realized/unrealized/invested/ROI crypto-only.
 */

/** Canonical Solana USDC mint — the synthetic cash position is keyed here. */
export const USDC_SOL_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** USDC logo — raw.githubusercontent serves it with permissive CORS (Solscan 403s hotlinks). */
export const USDC_LOGO =
  'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png';

/** Quote/stable symbols that ARE cash — they don't generate a cash leg themselves. */
const STABLES = new Set(['USDC', 'USDT', 'USD']);

function isCashLeg(e: LedgerEntry): boolean {
  return !STABLES.has(e.asset.toUpperCase());
}

/** USDC moved by a trade: out on buys (cost incl. fees), in on sells (proceeds net fees). */
function cashDelta(e: LedgerEntry): number {
  const notional = e.amount * e.priceUsd;
  return e.side === 'buy' ? -(notional + e.feeUsd + e.gasUsd) : notional - e.feeUsd - e.gasUsd;
}

export interface CashTimeline {
  /** Implicit initial USDC deposit that floors the running balance at 0. */
  deposit: number;
  /** Cumulative pre-deposit cash balance after each trade, time-ordered. */
  points: { ms: number; running: number }[];
}

/** Build the USDC cash timeline by replaying the ledger's cash legs. */
export function buildCashTimeline(entries: LedgerEntry[]): CashTimeline {
  const events = entries
    .filter(isCashLeg)
    .map((e) => ({ ms: new Date(e.timestamp).getTime(), delta: cashDelta(e) }))
    .sort((a, b) => a.ms - b.ms);

  let running = 0;
  let min = 0;
  const points = events.map((ev) => {
    running += ev.delta;
    if (running < min) min = running;
    return { ms: ev.ms, running };
  });
  return { deposit: Math.max(0, -min), points };
}

/** USDC balance as of `cutoffMs` (default: all). Never negative. */
export function usdcBalanceAt(
  timeline: CashTimeline,
  cutoffMs: number = Number.POSITIVE_INFINITY,
): number {
  let asOf = 0;
  for (const p of timeline.points) {
    if (p.ms <= cutoffMs) asOf = p.running;
    else break;
  }
  return timeline.deposit + asOf;
}

/** A manual cash adjustment reduced to its timestamp + signed amount. */
export interface CashAdjustmentLite {
  ms: number;
  amount: number;
}

/**
 * Net of manual cash adjustments effective as of `cutoffMs`. Applied ON TOP of
 * the trade-derived balance (not part of the deposit floor), so a withdrawal
 * just lowers the balance rather than inflating the implicit deposit.
 */
export function adjustmentsSumAt(
  adjustments: CashAdjustmentLite[],
  cutoffMs: number = Number.POSITIVE_INFINITY,
): number {
  let sum = 0;
  for (const a of adjustments) if (a.ms <= cutoffMs) sum += a.amount;
  return sum;
}
