import { tokenKey, type Chain, type NavPoint, type NavRange, type TokenRef } from '@pnl/types';
import type { LedgerEntry } from './pnlEngine';
import { adjustmentsSumAt, buildCashTimeline, usdcBalanceAt, type CashAdjustmentLite } from './cash';
import { getCurrentPricesCached, getHistoricalPriceCached } from './prices';

const DAY = 86_400_000;
const SPAN_DAYS: Record<NavRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
  all: Number.POSITIVE_INFINITY,
};

interface NavToken extends TokenRef {
  /** Display symbol (latest wins). */
  asset: string;
}

/** Distinct tokens (with display symbol) referenced by the ledger. */
function tokensOf(entries: LedgerEntry[]): NavToken[] {
  const seen = new Map<string, NavToken>();
  for (const e of entries) {
    // Entries arrive time-ordered, so the last write keeps the most recent symbol.
    seen.set(tokenKey(e.chain, e.address), { chain: e.chain, address: e.address, asset: e.asset });
  }
  return [...seen.values()];
}

/** Coins of a token held as of `cutoffMs` (buys − sells up to that instant). */
function heldAt(entries: LedgerEntry[], chain: Chain, address: string, cutoffMs: number): number {
  let qty = 0;
  for (const e of entries) {
    if (e.chain !== chain || e.address !== address) continue;
    if (new Date(e.timestamp).getTime() > cutoffMs) continue;
    qty += e.side === 'buy' ? e.amount : -e.amount;
  }
  return qty > 1e-9 ? qty : 0;
}

/**
 * Build the daily NAV series by replaying the ledger against historical daily
 * prices (cached). Today uses the live price. `nowMs` is injectable for tests.
 */
export async function computeNavSeries(
  entries: LedgerEntry[],
  range: NavRange,
  adjustments: CashAdjustmentLite[] = [],
  nowMs: number = Date.now(),
): Promise<NavPoint[]> {
  if (entries.length === 0) return [];

  const tokens = tokensOf(entries);
  const todayMid = Math.floor(nowMs / DAY) * DAY;
  const firstMid =
    Math.floor(Math.min(...entries.map((e) => new Date(e.timestamp).getTime())) / DAY) * DAY;
  const span = SPAN_DAYS[range];
  const startMid =
    range === 'all' ? firstMid : Math.max(firstMid, todayMid - (span - 1) * DAY);

  const days: number[] = [];
  for (let d = startMid; d <= todayMid; d += DAY) days.push(d);

  const current = await getCurrentPricesCached(tokens);
  const cash = buildCashTimeline(entries);

  return Promise.all(
    days.map(async (d) => {
      const dayEnd = d + DAY - 1;
      const isToday = d === todayMid;
      const breakdown: { chain: Chain; asset: string; valueUsd: number }[] = [];
      let total = 0;

      for (const t of tokens) {
        const qty = heldAt(entries, t.chain, t.address, dayEnd);
        if (qty <= 0) continue;
        const key = tokenKey(t.chain, t.address);
        const price = isToday
          ? current[key] ?? 0
          : ((await getHistoricalPriceCached(t.chain, t.address, d / 1000)) ?? current[key] ?? 0);
        const valueUsd = qty * price;
        breakdown.push({ chain: t.chain, asset: t.asset, valueUsd });
        total += valueUsd;
      }

      // USDC cash held that day — keeps the NAV total consistent with /holdings.
      const usdc = usdcBalanceAt(cash, dayEnd) + adjustmentsSumAt(adjustments, dayEnd);
      if (usdc > 0.01) {
        breakdown.push({ chain: 'sol', asset: 'USDC', valueUsd: usdc });
        total += usdc;
      }

      return { date: new Date(d).toISOString().slice(0, 10), totalValueUsd: total, breakdown };
    }),
  );
}
