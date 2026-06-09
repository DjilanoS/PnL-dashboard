import { isNativeToken, tokenKey, type Chain, type TokenRef } from '@pnl/types';
import { HistoricalPrice, PriceCache } from '../models/PriceCache';

/**
 * Price source: DefiLlama coins API — free, no key. Native SOL/SUI resolve via
 * the reliable `coingecko:` ids; arbitrary tokens via `solana:{mint}` /
 * `sui:{coinType}` (coverage varies → callers coerce null → 0 gracefully).
 */
const LLAMA = 'https://coins.llama.fi';

/** DefiLlama coin id for a token. */
function llamaId(chain: Chain, address: string): string {
  if (isNativeToken(chain, address)) {
    return chain === 'sol' ? 'coingecko:solana' : 'coingecko:sui';
  }
  return chain === 'sol' ? `solana:${address}` : `sui:${address}`;
}

interface LlamaResponse {
  coins?: Record<string, { price?: number; timestamp?: number }>;
}

/** Current USD prices for a set of tokens, keyed by `${chain}:${address}` (null if unknown). */
export async function getCurrentPricesForTokens(
  tokens: TokenRef[],
): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  if (tokens.length === 0) return out;

  const idByKey = new Map<string, string>();
  for (const t of tokens) {
    const key = tokenKey(t.chain, t.address);
    if (!idByKey.has(key)) idByKey.set(key, llamaId(t.chain, t.address));
    out[key] = null;
  }

  const ids = [...new Set(idByKey.values())].join(',');
  const res = await fetch(`${LLAMA}/prices/current/${ids}`);
  if (!res.ok) return out;
  const data = (await res.json()) as LlamaResponse;
  for (const [key, id] of idByKey) {
    out[key] = data.coins?.[id]?.price ?? null;
  }
  return out;
}

/** Current USD price for one token, or null. */
export async function getCurrentPriceForToken(chain: Chain, address: string): Promise<number | null> {
  const map = await getCurrentPricesForTokens([{ chain, address }]);
  return map[tokenKey(chain, address)] ?? null;
}

/** USD price of a token at a unix-seconds timestamp, or null if unavailable. */
export async function getHistoricalPriceForToken(
  chain: Chain,
  address: string,
  unixSeconds: number,
): Promise<number | null> {
  const id = llamaId(chain, address);
  const ts = Math.floor(unixSeconds);
  const res = await fetch(`${LLAMA}/prices/historical/${ts}/${id}?searchWidth=6h`);
  if (!res.ok) return null;
  const data = (await res.json()) as LlamaResponse;
  return data.coins?.[id]?.price ?? null;
}

/**
 * Current prices for a set of tokens with a ~60s MongoDB cache (per token).
 * Returns a map keyed by `${chain}:${address}`; unknown/uncovered tokens → 0
 * (falls back to the last cached value on API outage).
 */
export async function getCurrentPricesCached(tokens: TokenRef[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (tokens.length === 0) return out;

  const want = new Map<string, TokenRef>();
  for (const t of tokens) want.set(tokenKey(t.chain, t.address), t);

  const cached = await PriceCache.find({});
  const have = new Map<string, number>();
  for (const c of cached) have.set(tokenKey(c.chain as Chain, c.address), c.priceUsd);

  const missing: TokenRef[] = [];
  for (const [key, t] of want) {
    const hit = have.get(key);
    if (hit != null) out[key] = hit;
    else missing.push(t);
  }
  if (missing.length === 0) return out;

  const live = await getCurrentPricesForTokens(missing);
  for (const t of missing) {
    const key = tokenKey(t.chain, t.address);
    const price = live[key];
    if (price != null) {
      await PriceCache.updateOne(
        { chain: t.chain, address: t.address },
        { chain: t.chain, address: t.address, priceUsd: price, fetchedAt: new Date() },
        { upsert: true },
      );
      out[key] = price;
    } else {
      out[key] = have.get(key) ?? 0;
    }
  }
  return out;
}

/** Historical price with a permanent daily cache (per token, immutable). */
export async function getHistoricalPriceCached(
  chain: Chain,
  address: string,
  unixSeconds: number,
): Promise<number | null> {
  const dayTs = Math.floor(unixSeconds / 86_400) * 86_400;
  const hit = await HistoricalPrice.findOne({ chain, address, dayTs });
  if (hit) return hit.priceUsd;

  const price = await getHistoricalPriceForToken(chain, address, unixSeconds);
  if (price != null) {
    await HistoricalPrice.updateOne(
      { chain, address, dayTs },
      { chain, address, dayTs, priceUsd: price },
      { upsert: true },
    );
  }
  return price;
}
