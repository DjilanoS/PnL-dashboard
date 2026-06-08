import type { Asset } from '@pnl/types';
import { HistoricalPrice, PriceCache } from '../models/PriceCache';

/**
 * Price source for the two native assets. DefiLlama coins API — free, no key,
 * covers SOL and SUI for both current and historical-at-timestamp lookups.
 * Caching (PriceCache model) is layered on in M5.
 */
const COIN_ID: Record<Asset, string> = {
  SOL: 'coingecko:solana',
  SUI: 'coingecko:sui',
};
const LLAMA = 'https://coins.llama.fi';

interface LlamaResponse {
  coins?: Record<string, { price?: number; timestamp?: number }>;
}

/** USD price of an asset at a unix-seconds timestamp, or null if unavailable. */
export async function getHistoricalPrice(asset: Asset, unixSeconds: number): Promise<number | null> {
  const id = COIN_ID[asset];
  const ts = Math.floor(unixSeconds);
  const res = await fetch(`${LLAMA}/prices/historical/${ts}/${id}?searchWidth=6h`);
  if (!res.ok) return null;
  const data = (await res.json()) as LlamaResponse;
  return data.coins?.[id]?.price ?? null;
}

/** Current USD prices for both native assets. */
export async function getCurrentPrices(): Promise<Record<Asset, number | null>> {
  const ids = `${COIN_ID.SOL},${COIN_ID.SUI}`;
  const res = await fetch(`${LLAMA}/prices/current/${ids}`);
  if (!res.ok) return { SOL: null, SUI: null };
  const data = (await res.json()) as LlamaResponse;
  return {
    SOL: data.coins?.[COIN_ID.SOL]?.price ?? null,
    SUI: data.coins?.[COIN_ID.SUI]?.price ?? null,
  };
}

export async function getCurrentPrice(asset: Asset): Promise<number | null> {
  return (await getCurrentPrices())[asset];
}

/** Current prices with a ~60s MongoDB cache (falls back to last cache on API outage). */
export async function getCurrentPricesCached(): Promise<Record<Asset, number>> {
  const cached = await PriceCache.find({});
  const map: Partial<Record<Asset, number>> = {};
  for (const c of cached) map[c.asset as Asset] = c.priceUsd;

  if (map.SOL != null && map.SUI != null) {
    return { SOL: map.SOL, SUI: map.SUI };
  }

  const live = await getCurrentPrices();
  for (const asset of ['SOL', 'SUI'] as Asset[]) {
    if (live[asset] != null) {
      await PriceCache.updateOne(
        { asset },
        { asset, priceUsd: live[asset], fetchedAt: new Date() },
        { upsert: true },
      );
    }
  }
  return {
    SOL: live.SOL ?? map.SOL ?? 0,
    SUI: live.SUI ?? map.SUI ?? 0,
  };
}

/** Historical price with a permanent daily cache (immutable). */
export async function getHistoricalPriceCached(asset: Asset, unixSeconds: number): Promise<number | null> {
  const dayTs = Math.floor(unixSeconds / 86_400) * 86_400;
  const hit = await HistoricalPrice.findOne({ asset, dayTs });
  if (hit) return hit.priceUsd;

  const price = await getHistoricalPrice(asset, unixSeconds);
  if (price != null) {
    await HistoricalPrice.updateOne({ asset, dayTs }, { asset, dayTs, priceUsd: price }, { upsert: true });
  }
  return price;
}
