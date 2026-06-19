/**
 * Fallback logos + brand colors for well-known tokens, keyed by display symbol.
 * Used when the backend doesn't carry an `image`/color for a token (e.g. native
 * SOL/SUI, USDC). A real `image` from the API always takes priority over the logo.
 */

// raw.githubusercontent serves these with `Access-Control-Allow-Origin: *`, so
// they load as <img> AND are usable for canvas color extraction (the Solscan
// proxy 403s on hotlinks).
const KNOWN_LOGOS: Record<string, string> = {
  SOL: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  USDC: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  SUI: 'https://strapi-space-bucket-fra1-1.fra1.cdn.digitaloceanspaces.com/sui_c07df05f00.png',
};

// Fixed accent colors for tokens whose color shouldn't be derived from the logo.
// USDC cash is white; SOL/SUI are pinned to their brand colors so they don't get
// a similar blue from logo extraction (otherwise all three read as blue).
const KNOWN_COLORS: Record<string, string> = {
  USDC: '#FFFFFF', // white
  SUI: '#4da2ff', // light blue (mirrors --sui)
  SOL: '#9945ff', // purple (mirrors --solana)
};

/** Logo URL for a known token symbol, or undefined if we don't have one. */
export function knownTokenLogo(asset?: string): string | undefined {
  if (!asset) return undefined;
  return KNOWN_LOGOS[asset.toUpperCase()];
}

/** Fixed accent color (hex) for a known token symbol, or undefined. */
export function knownTokenColor(asset?: string): string | undefined {
  if (!asset) return undefined;
  return KNOWN_COLORS[asset.toUpperCase()];
}
