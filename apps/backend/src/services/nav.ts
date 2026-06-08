import type { Asset, NavPoint, NavRange } from '@pnl/types';
import type { LedgerEntry } from './pnlEngine';
import { getCurrentPricesCached, getHistoricalPriceCached } from './prices';

const DAY = 86_400_000;
const ASSETS: Asset[] = ['SOL', 'SUI'];
const SPAN_DAYS: Record<NavRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
  all: Number.POSITIVE_INFINITY,
};

/** Coins of `asset` held as of `cutoffMs` (buys − sells up to that instant). */
function heldAt(entries: LedgerEntry[], asset: Asset, cutoffMs: number): number {
  let qty = 0;
  for (const e of entries) {
    if (e.asset !== asset) continue;
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
  nowMs: number = Date.now(),
): Promise<NavPoint[]> {
  if (entries.length === 0) return [];

  const todayMid = Math.floor(nowMs / DAY) * DAY;
  const firstMid =
    Math.floor(Math.min(...entries.map((e) => new Date(e.timestamp).getTime())) / DAY) * DAY;
  const span = SPAN_DAYS[range];
  const startMid =
    range === 'all' ? firstMid : Math.max(firstMid, todayMid - (span - 1) * DAY);

  const days: number[] = [];
  for (let d = startMid; d <= todayMid; d += DAY) days.push(d);

  const current = await getCurrentPricesCached();

  return Promise.all(
    days.map(async (d) => {
      const dayEnd = d + DAY - 1;
      const isToday = d === todayMid;
      const breakdown: { asset: Asset; valueUsd: number }[] = [];
      let total = 0;

      for (const asset of ASSETS) {
        const qty = heldAt(entries, asset, dayEnd);
        if (qty <= 0) continue;
        const price = isToday
          ? current[asset]
          : ((await getHistoricalPriceCached(asset, d / 1000)) ?? current[asset] ?? 0);
        const valueUsd = qty * price;
        breakdown.push({ asset, valueUsd });
        total += valueUsd;
      }

      return { date: new Date(d).toISOString().slice(0, 10), totalValueUsd: total, breakdown };
    }),
  );
}
