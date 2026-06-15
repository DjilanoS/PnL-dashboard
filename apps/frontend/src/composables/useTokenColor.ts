import { ref, watchEffect, type Ref } from 'vue';
import type { Chain } from '@pnl/types';
import { knownTokenColor } from '@/lib/tokenLogos';

/**
 * Per-token accent color, derived from the token's logo image.
 *
 * Token logos are remote URLs on third-party CDNs. Reading their pixels via a
 * canvas taints it cross-origin and throws on `getImageData` unless the host
 * sends CORS headers AND we request with `crossOrigin='anonymous'`. Many CDNs
 * don't, so failure is an EXPECTED path: every failure mode (load error,
 * SecurityError, no usable pixels) falls back to the chain color.
 *
 * The output is a hex string so it's usable both as a CSS value (card accent)
 * and by lightweight-charts (which renders to canvas and ignores CSS vars).
 */

// Chain fallbacks — mirror --solana / --sui in assets/index.css.
const CHAIN_HEX: Record<Chain, string> = { sol: '#9945ff', sui: '#4da2ff' };

const cache = new Map<string, string>(); // url -> resolved hex
const inflight = new Map<string, Promise<string>>(); // url -> in-progress decode

function extract(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(url);
  if (pending) return pending;

  const job = new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // required (but not sufficient) for getImageData
    img.onload = () => {
      try {
        const S = 16;
        const canvas = document.createElement('canvas');
        canvas.width = S;
        canvas.height = S;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return reject(new Error('no 2d context'));
        ctx.drawImage(img, 0, 0, S, S);
        const { data } = ctx.getImageData(0, 0, S, S); // throws SecurityError if tainted

        // Saturation-weighted average: bias toward vivid brand pixels, skip
        // transparent / near-white / near-black so logos on white/dark
        // backgrounds don't wash out to grey.
        let r = 0;
        let g = 0;
        let b = 0;
        let wsum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i] ?? 0;
          const pg = data[i + 1] ?? 0;
          const pb = data[i + 2] ?? 0;
          const pa = data[i + 3] ?? 0;
          if (pa < 128) continue;
          const mx = Math.max(pr, pg, pb);
          const mn = Math.min(pr, pg, pb);
          if (mx > 240 && mn > 240) continue; // near-white
          if (mx < 16) continue; // near-black
          const sat = mx === 0 ? 0 : (mx - mn) / mx;
          const w = 0.15 + sat; // floor so muted logos still register
          r += pr * w;
          g += pg * w;
          b += pb * w;
          wsum += w;
        }
        if (wsum === 0) return reject(new Error('no usable pixels'));
        const hex =
          '#' +
          [r, g, b]
            .map((v) => Math.round(v / wsum).toString(16).padStart(2, '0'))
            .join('');
        cache.set(url, hex);
        resolve(hex);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('extract failed'));
      }
    };
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  }).finally(() => inflight.delete(url));

  inflight.set(url, job);
  return job;
}

/** Synchronous chain fallback color (hex). */
export function chainColor(chain: Chain): string {
  return CHAIN_HEX[chain];
}

/**
 * Resolve a logo URL to its dominant hex color (cached, deduped). Rejects on
 * any failure — callers should fall back to {@link chainColor}. Exposed for
 * imperative canvas consumers (lightweight-charts) that can't use the ref API.
 */
export function extractTokenColor(url: string): Promise<string> {
  return extract(url);
}

type Source<T> = Ref<T> | (() => T);

function read<T>(source: Source<T>): T {
  return typeof source === 'function' ? (source as () => T)() : source.value;
}

/**
 * Returns a reactive hex color for a token. Resolves to the chain color
 * immediately (no flicker), then to the logo's dominant color if extraction
 * succeeds.
 */
export function useTokenColor(
  image: Source<string | undefined>,
  chain: Source<Chain>,
  asset?: Source<string | undefined>,
): Ref<string> {
  const color = ref(CHAIN_HEX.sol);
  watchEffect(() => {
    // A fixed brand color (e.g. USDC light blue) wins over logo extraction.
    const known = asset ? knownTokenColor(read(asset)) : undefined;
    if (known) {
      color.value = known;
      return;
    }
    const url = read(image);
    const ch = read(chain);
    color.value = CHAIN_HEX[ch]; // immediate fallback
    if (!url) return;
    extract(url)
      .then((hex) => {
        if (read(image) === url) color.value = hex; // ignore stale resolves
      })
      .catch(() => {
        /* keep chain color */
      });
  });
  return color;
}
