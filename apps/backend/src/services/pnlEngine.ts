import type { Asset, AssetPnl, PnlSummary } from '@pnl/types';

/** Minimal order shape the engine needs (a row of the ledger). */
export interface LedgerEntry {
  asset: Asset;
  side: 'buy' | 'sell';
  amount: number;
  priceUsd: number;
  feeUsd: number;
  gasUsd: number;
  timestamp: string;
}

const EPS = 1e-12;

/**
 * Weighted-average cost basis for a single asset. Replays the (time-ordered)
 * ledger: buys add to cost basis incl. fees/gas; sells realize PnL against the
 * running average and reduce basis proportionally (average unchanged).
 */
export function computeAssetPnl(
  asset: Asset,
  entries: LedgerEntry[],
  currentPrice: number,
): AssetPnl {
  let held = 0;
  let costBasis = 0;
  let realized = 0;
  let invested = 0; // gross USD put in via buys (incl. fees/gas)
  let buyQty = 0;
  let buyNotional = 0; // incl. fees → avg buy price
  let sellQty = 0;
  let sellNotional = 0; // net fees → avg sell price

  const sorted = [...entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  for (const e of sorted) {
    if (e.side === 'buy') {
      const cost = e.amount * e.priceUsd + e.feeUsd + e.gasUsd;
      costBasis += cost;
      held += e.amount;
      invested += cost;
      buyQty += e.amount;
      buyNotional += cost;
    } else {
      const avgCost = held > EPS ? costBasis / held : 0;
      const proceeds = e.amount * e.priceUsd - e.feeUsd - e.gasUsd;
      realized += proceeds - avgCost * e.amount;
      costBasis -= avgCost * e.amount;
      held -= e.amount;
      if (held <= EPS) {
        held = Math.max(held, 0);
        costBasis = held <= EPS ? 0 : costBasis;
      }
      sellQty += e.amount;
      sellNotional += proceeds;
    }
  }

  const avgCost = held > EPS ? costBasis / held : 0;
  const marketValue = held * currentPrice;
  const unrealized = held > EPS ? (currentPrice - avgCost) * held : 0;

  return {
    asset,
    held,
    avgCost,
    costBasis,
    currentPrice,
    marketValue,
    realized,
    unrealized,
    invested,
    avgBuy: buyQty > EPS ? buyNotional / buyQty : 0,
    avgSell: sellQty > EPS ? sellNotional / sellQty : 0,
  };
}

const ASSETS: Asset[] = ['SOL', 'SUI'];

/** Portfolio-wide PnL summary across both assets. */
export function computePnl(
  entries: LedgerEntry[],
  prices: Record<Asset, number>,
): PnlSummary {
  const perAsset: AssetPnl[] = [];
  for (const asset of ASSETS) {
    const assetEntries = entries.filter((e) => e.asset === asset);
    if (assetEntries.length === 0) continue;
    perAsset.push(computeAssetPnl(asset, assetEntries, prices[asset] ?? 0));
  }

  const realized = perAsset.reduce((s, a) => s + a.realized, 0);
  const unrealized = perAsset.reduce((s, a) => s + a.unrealized, 0);
  const invested = perAsset.reduce((s, a) => s + a.invested, 0);
  const total = realized + unrealized;

  return {
    realized,
    unrealized,
    total,
    invested,
    roi: invested > EPS ? total / invested : 0,
    perAsset,
  };
}
