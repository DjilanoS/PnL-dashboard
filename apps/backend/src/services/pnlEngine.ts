import { tokenKey, type AssetPnl, type Chain, type PnlSummary } from '@pnl/types';

/** Token identity carried through the engine (denormalized display metadata). */
export interface TokenMetaLite {
  chain: Chain;
  address: string;
  asset: string;
  decimals: number;
  name?: string;
  image?: string;
}

/** Minimal order shape the engine needs (a row of the ledger). */
export interface LedgerEntry extends TokenMetaLite {
  side: 'buy' | 'sell';
  amount: number;
  priceUsd: number;
  feeUsd: number;
  gasUsd: number;
  timestamp: string;
}

const EPS = 1e-12;

/**
 * Weighted-average cost basis for a single token. Replays the (time-ordered)
 * ledger: buys add to cost basis incl. fees/gas; sells realize PnL against the
 * running average and reduce basis proportionally (average unchanged).
 */
export function computeTokenPnl(
  token: TokenMetaLite,
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
    chain: token.chain,
    address: token.address,
    asset: token.asset,
    name: token.name,
    image: token.image,
    decimals: token.decimals,
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

/** Token display metadata from a group of entries — the most recent wins. */
function metaOf(entries: LedgerEntry[]): TokenMetaLite {
  let latest = entries[0]!;
  for (const e of entries) if (e.timestamp > latest.timestamp) latest = e;
  return {
    chain: latest.chain,
    address: latest.address,
    asset: latest.asset,
    decimals: latest.decimals,
    name: latest.name,
    image: latest.image,
  };
}

/**
 * Portfolio-wide PnL summary across all held tokens. Entries are grouped by
 * `(chain, address)`; `prices` is keyed by `tokenKey(chain, address)`.
 */
export function computePnl(
  entries: LedgerEntry[],
  prices: Record<string, number>,
): PnlSummary {
  const groups = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    const key = tokenKey(e.chain, e.address);
    const arr = groups.get(key);
    if (arr) arr.push(e);
    else groups.set(key, [e]);
  }

  const perAsset: AssetPnl[] = [];
  for (const [key, es] of groups) {
    perAsset.push(computeTokenPnl(metaOf(es), es, prices[key] ?? 0));
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
