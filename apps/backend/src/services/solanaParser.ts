import type { Asset, ParsedOrderPreview } from '@pnl/types';
import { HELIUS_API_BASE, heliusApiKey, solanaRpcUrl, type AppConfig } from '../config/env';
import { getHistoricalPrice } from './prices';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Minimal shape of a Helius enriched transaction (only fields we use).
export interface HeliusTx {
  signature: string;
  timestamp: number;
  type: string;
  fee: number;
  feePayer: string;
  accountData?: {
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges?: {
      userAccount: string;
      mint: string;
      rawTokenAmount: { tokenAmount: string; decimals: number };
    }[];
  }[];
}

/** Extract a base58 signature from an explorer URL or raw input. */
export function extractSolanaSignature(input: string): string | null {
  const s = input.trim();
  const fromUrl = s.match(/(?:tx|transaction)\/([1-9A-HJ-NP-Za-km-z]{43,90})/);
  if (fromUrl) return fromUrl[1] ?? null;
  if (/^[1-9A-HJ-NP-Za-km-z]{43,90}$/.test(s)) return s;
  return null;
}

function explorerUrl(sig: string): string {
  return `https://solscan.io/tx/${sig}`;
}

/** Net SOL change (in whole SOL) for the user's wallet, with fee added back. */
export function solDeltaForUser(tx: HeliusTx, user: string): number {
  const acct = tx.accountData?.find((a) => a.account === user);
  let lamports = acct?.nativeBalanceChange ?? 0;
  if (tx.feePayer === user) lamports += tx.fee; // exclude gas from the trade size
  let sol = lamports / 1e9;

  // Include wrapped-SOL token balance changes for the user (wSOL == SOL).
  for (const a of tx.accountData ?? []) {
    for (const t of a.tokenBalanceChanges ?? []) {
      if (t.mint === WSOL_MINT && t.userAccount === user) {
        sol += Number(t.rawTokenAmount.tokenAmount) / 10 ** t.rawTokenAmount.decimals;
      }
    }
  }
  return sol;
}

/** Turn a Helius tx into a SOL buy/sell preview for the user, or null. */
export async function parseSolanaTx(tx: HeliusTx, user: string): Promise<ParsedOrderPreview | null> {
  if (!user) return null;
  const delta = solDeltaForUser(tx, user);
  if (Math.abs(delta) < 1e-6) return null;

  const side = delta > 0 ? 'buy' : 'sell';
  const amount = Math.abs(delta);
  const asset: Asset = 'SOL';
  const price = (await getHistoricalPrice(asset, tx.timestamp)) ?? 0;
  const gasUsd = (tx.feePayer === user ? tx.fee / 1e9 : 0) * price;

  return {
    chain: 'sol',
    asset,
    side,
    amount,
    priceUsd: price,
    quote: { symbol: 'USD', amount: amount * price },
    feeUsd: 0,
    gasUsd,
    timestamp: new Date(tx.timestamp * 1000).toISOString(),
    txSignature: tx.signature,
    explorerUrl: explorerUrl(tx.signature),
  };
}

async function heliusError(res: Response): Promise<never> {
  const body = await res.text().catch(() => '');
  const hint = res.status === 401 ? ' — check HELIUS_API_KEY (use just the key, not the RPC URL)' : '';
  throw new Error(`Helius request failed (${res.status})${hint}${body ? `: ${body.slice(0, 200)}` : ''}`);
}

// --- Raw getTransaction parsing (robust; treats wSOL as SOL by construction) ---

interface RawTx {
  blockTime?: number | null;
  meta?: {
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: RawTokenBalance[];
    postTokenBalances?: RawTokenBalance[];
    loadedAddresses?: { writable?: string[]; readonly?: string[] };
  } | null;
  transaction: { message: { accountKeys: ({ pubkey: string } | string)[] } };
}
interface RawTokenBalance {
  owner?: string;
  mint: string;
  uiTokenAmount: { amount: string; decimals: number };
}

function wsolSum(balances: RawTokenBalance[] | undefined, user: string): number {
  let sum = 0;
  for (const b of balances ?? []) {
    if (b.mint === WSOL_MINT && b.owner === user) {
      sum += Number(b.uiTokenAmount.amount) / 10 ** b.uiTokenAmount.decimals;
    }
  }
  return sum;
}

/**
 * Net SOL change (whole SOL) for the user from a raw jsonParsed transaction:
 * native balance delta (fee added back) + the user's own wSOL balance delta.
 * wSOL is counted as SOL because it is just wrapped SOL.
 */
export function solDeltaFromRawTx(raw: RawTx, user: string): number {
  const meta = raw.meta;
  if (!meta) return 0;

  const staticKeys = raw.transaction.message.accountKeys.map((k) =>
    typeof k === 'string' ? k : k.pubkey,
  );
  const fullKeys = [
    ...staticKeys,
    ...(meta.loadedAddresses?.writable ?? []),
    ...(meta.loadedAddresses?.readonly ?? []),
  ];

  const idx = fullKeys.indexOf(user);
  let lamports = idx >= 0 ? (meta.postBalances[idx] ?? 0) - (meta.preBalances[idx] ?? 0) : 0;
  if (staticKeys[0] === user) lamports += meta.fee; // exclude gas from trade size

  const wsolDelta = wsolSum(meta.postTokenBalances, user) - wsolSum(meta.preTokenBalances, user);
  return lamports / 1e9 + wsolDelta;
}

async function fetchRawTx(config: AppConfig, sig: string): Promise<RawTx | null> {
  const res = await fetch(solanaRpcUrl(config), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTransaction',
      params: [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
    }),
    // Don't follow redirects: a (possibly user-supplied) RPC URL must not be
    // able to bounce this server-side request to an internal target.
    redirect: 'manual',
  });
  if (!res.ok) await heliusError(res);
  const json = (await res.json()) as { result?: RawTx | null; error?: { message?: string } };
  if (json.error) throw new Error(`RPC error: ${json.error.message ?? 'unknown'}`);
  return json.result ?? null;
}

/**
 * Parse a Solana tx into a SOL trade. `address` is the wallet whose position
 * changed — defaults to the transaction's fee payer (signer), so you can log a
 * trade made from ANY wallet, not just the one you're signed in with.
 */
export async function parseSolanaSignature(
  config: AppConfig,
  urlOrSig: string,
  address?: string,
): Promise<ParsedOrderPreview | null> {
  const sig = extractSolanaSignature(urlOrSig);
  if (!sig) throw new Error('Could not find a Solana signature in that input');

  const raw = await fetchRawTx(config, sig);
  if (!raw || !raw.meta) throw new Error('Transaction not found');

  const firstKey = raw.transaction.message.accountKeys[0];
  const feePayer = typeof firstKey === 'string' ? firstKey : firstKey?.pubkey;
  const ref = address || feePayer;
  if (!ref) return null;

  const delta = solDeltaFromRawTx(raw, ref);
  if (Math.abs(delta) < 1e-6) return null;

  const side = delta > 0 ? 'buy' : 'sell';
  const amount = Math.abs(delta);
  const asset: Asset = 'SOL';
  const ts = raw.blockTime ?? Math.floor(Date.now() / 1000);
  const price = (await getHistoricalPrice(asset, ts)) ?? 0;
  const gasUsd = (feePayer === ref ? raw.meta.fee / 1e9 : 0) * price;

  return {
    chain: 'sol',
    asset,
    side,
    amount,
    priceUsd: price,
    quote: { symbol: 'USD', amount: amount * price },
    feeUsd: 0,
    gasUsd,
    timestamp: new Date(ts * 1000).toISOString(),
    txSignature: sig,
    explorerUrl: explorerUrl(sig),
  };
}

export async function scanSolana(
  config: AppConfig,
  user: string,
  limit = 50,
): Promise<ParsedOrderPreview[]> {
  // Recent-swap scanning uses the operator's Helius Enhanced Transactions API
  // (not the user's custom RPC, which is a plain JSON-RPC endpoint).
  if (!heliusApiKey(config)) throw new Error('HELIUS_API_KEY is not configured');
  if (!user) throw new Error('No wallet address provided to scan');
  const url = `${HELIUS_API_BASE}/addresses/${user}/transactions?api-key=${heliusApiKey(config)}&type=SWAP&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) await heliusError(res);
  const txs = (await res.json()) as HeliusTx[];

  const out: ParsedOrderPreview[] = [];
  for (const tx of txs) {
    const preview = await parseSolanaTx(tx, user);
    if (preview) out.push(preview);
  }
  return out;
}
