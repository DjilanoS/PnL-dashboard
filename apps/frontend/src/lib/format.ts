/** Formatting helpers shared across cards and tables. */

export function fmtUsd(n: number, maxFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: maxFractionDigits,
  }).format(n);
}

/** Compact USD for large totals (e.g. $12.3K). */
export function fmtUsdCompact(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: Math.abs(n) >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 2,
  }).format(n);
}

export function fmtNum(n: number, maxFractionDigits = 4): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: maxFractionDigits }).format(n);
}

/**
 * Magnitude-aware decimals for a token amount/price:
 *  - |n| >= 1     → 2 decimals
 *  - 0.01 ≤ |n| < 1 → 3 decimals
 *  - |n| < 0.01   → significant digits, so sub-cent prices keep their real value
 */
function tokenFractionOpts(n: number): Intl.NumberFormatOptions {
  const abs = Math.abs(n);
  if (abs >= 1) return { maximumFractionDigits: 2 };
  if (abs >= 0.01) return { maximumFractionDigits: 3 };
  return { maximumSignificantDigits: 4 };
}

/** USD price for a non-USDC token (magnitude-aware decimals). */
export function fmtTokenUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    ...tokenFractionOpts(n),
  }).format(n);
}

/** Bare token quantity (magnitude-aware decimals). */
export function fmtTokenQty(n: number): string {
  return new Intl.NumberFormat('en-US', tokenFractionOpts(n)).format(n);
}

/** USD price/cost for an asset: USDC shows whole dollars, tokens use magnitude-aware decimals. */
export function fmtAssetUsd(n: number, isUsdc: boolean): string {
  return isUsdc ? fmtUsd(n, 0) : fmtTokenUsd(n);
}

/** Quantity for an asset: USDC shows whole units, tokens use magnitude-aware decimals. */
export function fmtAssetQty(n: number, isUsdc: boolean): string {
  return isUsdc ? fmtNum(n, 0) : fmtTokenQty(n);
}

export function fmtPct(ratio: number): string {
  const sign = ratio > 0 ? '+' : '';
  return `${sign}${(ratio * 100).toFixed(2)}%`;
}

export function fmtSignedUsd(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${fmtUsd(n)}`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function shortSig(sig: string): string {
  return sig.length > 14 ? `${sig.slice(0, 6)}…${sig.slice(-6)}` : sig;
}

/** Truncate a wallet/account address to `head…tail` form. */
export function shortAddress(addr: string, head = 6, tail = 6): string {
  return addr.length > head + tail + 1 ? `${addr.slice(0, head)}…${addr.slice(-tail)}` : addr;
}

/** Local datetime string for an <input type="datetime-local"> default value. */
export function nowLocalDatetime(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

/** ISO timestamp → local string for an <input type="datetime-local"> value. */
export function isoToLocalDatetime(iso: string): string {
  const d = new Date(iso);
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}
