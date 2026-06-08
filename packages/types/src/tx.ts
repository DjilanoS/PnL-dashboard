import type { Chain, OrderCore } from './order';

/**
 * A parsed trade ready for review — the same shape as an order's core data,
 * plus the on-chain signature it came from. Not yet persisted.
 */
export interface ParsedOrderPreview extends OrderCore {
  txSignature: string;
  /** Block explorer URL for the source transaction. */
  explorerUrl: string;
}

/** Request to parse a single tx link or raw signature/digest. */
export interface ParseRequest {
  chain: Chain;
  /** An explorer URL or a raw signature (Solana) / digest (Sui). */
  urlOrSig: string;
}

export interface ParseResponse {
  preview: ParsedOrderPreview;
}

/** Request to scan the connected wallet's recent history for swaps. */
export interface ScanRequest {
  chain: Chain;
  /** Max number of recent transactions to scan (default server-side). */
  limit?: number;
}

export interface ScanResponse {
  /** Detected swap candidates, keyed by txSignature, ready to import. */
  candidates: ParsedOrderPreview[];
}

/**
 * Import one parsed trade into the ledger. Either re-parse from a link/sig,
 * or pass a previously-previewed candidate directly.
 */
export interface ImportRequest {
  chain: Chain;
  urlOrSig?: string;
  candidate?: ParsedOrderPreview;
}
