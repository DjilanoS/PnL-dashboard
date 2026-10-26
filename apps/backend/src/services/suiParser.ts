import { SuiGrpcClient } from '@mysten/sui/grpc';
import type { SuiClientTypes } from '@mysten/sui/client';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import {
  NATIVE_SUI_TYPE,
  shortAddress,
  type OwnedAsset,
  type ParsedOrderPreview,
  type TokenMeta,
} from '@pnl/types';
import { DEFAULT_SUI_RPC, type AppConfig } from '../config/env';
import { getHistoricalPriceForToken } from './prices';

/** A Sui tx as returned by the gRPC client with the includes the parser needs. */
export type SuiTx = SuiClientTypes.Transaction<{ balanceChanges: true; effects: true }>;

const TX_INCLUDE = { balanceChanges: true, effects: true } as const;

// Cache one client per RPC URL so per-user custom endpoints don't collide.
// Public fullnodes no longer serve JSON-RPC, so this talks gRPC(-web).
const clientsByUrl = new Map<string, SuiGrpcClient>();
export function getSuiClient(config: AppConfig): SuiGrpcClient {
  const url = config.SUI_RPC_URL || DEFAULT_SUI_RPC;
  let client = clientsByUrl.get(url);
  if (!client) {
    client = new SuiGrpcClient({ baseUrl: url, network: 'mainnet' });
    clientsByUrl.set(url, client);
  }
  return client;
}
const suiClient = getSuiClient;

/** Unwrap a gRPC TransactionResult (executed or failed) into the tx itself. */
function unwrapTx<T>(res: { Transaction?: T; FailedTransaction?: T }): T {
  return (res.Transaction ?? res.FailedTransaction) as T;
}

/** True for the native SUI coin type (0x2::sui::SUI, any zero-padding). */
function isSuiCoin(coinType: string): boolean {
  return /^0x0*2::sui::SUI$/.test(coinType);
}

export function extractSuiDigest(input: string): string | null {
  const s = input.trim();
  const fromUrl = s.match(/(?:txblock|tx)\/([1-9A-HJ-NP-Za-km-z]{40,50})/);
  if (fromUrl) return fromUrl[1] ?? null;
  if (/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(s)) return s;
  return null;
}

function explorerUrl(digest: string): string {
  return `https://suivision.xyz/txblock/${digest}`;
}

/** Net SUI change (whole SUI) for the user, with gas added back, plus gas in SUI. */
export function suiDeltaForUser(tx: SuiTx, user: string): { sui: number; gas: number } {
  const addr = normalizeSuiAddress(user);
  let mist = 0n;
  for (const bc of tx.balanceChanges ?? []) {
    if (bc.address && normalizeSuiAddress(bc.address) === addr && isSuiCoin(bc.coinType)) {
      mist += BigInt(bc.amount);
    }
  }
  const g = tx.effects?.gasUsed;
  const gas = g
    ? BigInt(g.computationCost) + BigInt(g.storageCost) - BigInt(g.storageRebate)
    : 0n;
  return { sui: Number(mist + gas) / 1e9, gas: Number(gas) / 1e9 };
}

export async function parseSuiTx(tx: SuiTx, user: string): Promise<ParsedOrderPreview | null> {
  if (!user) return null;
  if (!tx.status.success) return null;

  const { sui, gas } = suiDeltaForUser(tx, user);
  if (Math.abs(sui) < 1e-6) return null;

  const side = sui > 0 ? 'buy' : 'sell';
  const amount = Math.abs(sui);
  const tsMs = Number(tx.timestampMs ?? 0);
  const price = (tsMs ? await getHistoricalPriceForToken('sui', NATIVE_SUI_TYPE, tsMs / 1000) : null) ?? 0;

  return {
    chain: 'sui',
    address: NATIVE_SUI_TYPE,
    asset: 'SUI',
    decimals: 9,
    side,
    amount,
    priceUsd: price,
    quote: { symbol: 'USD', amount: amount * price },
    feeUsd: 0,
    gasUsd: gas * price,
    timestamp: new Date(tsMs).toISOString(),
    txSignature: tx.digest,
    explorerUrl: explorerUrl(tx.digest),
  };
}

/**
 * Parse a Sui tx into a SUI trade. `address` defaults to the transaction's
 * sender, so a trade from any Sui wallet can be logged to your account.
 */
export async function parseSuiDigest(
  config: AppConfig,
  urlOrSig: string,
  address?: string,
): Promise<ParsedOrderPreview | null> {
  const digest = extractSuiDigest(urlOrSig);
  if (!digest) throw new Error('Could not find a Sui digest in that input');
  const tx = unwrapTx(
    await suiClient(config).core.getTransaction({
      digest,
      include: { ...TX_INCLUDE, transaction: true },
    }),
  );
  const sender = tx.transaction?.sender;
  const ref = address || sender;
  if (!ref) return null;
  return parseSuiTx(tx, ref);
}

export async function scanSui(
  config: AppConfig,
  user: string,
  limit = 50,
): Promise<ParsedOrderPreview[]> {
  if (!user) throw new Error('Link your Sui wallet first');
  const res = await suiClient(config).core.listTransactions({
    filter: { sender: normalizeSuiAddress(user) },
    include: TX_INCLUDE,
    limit,
    order: 'descending',
  });

  const out: ParsedOrderPreview[] = [];
  for (const result of res.transactions) {
    const preview = await parseSuiTx(unwrapTx(result), user);
    if (preview) out.push(preview);
  }
  return out;
}

// --- Sui coin discovery (the equivalent of Helius DAS for Sui) ---

/** All coin balances held by `owner` → OwnedAsset rows. Prices filled by the caller. */
export async function getSuiAssetsByOwner(config: AppConfig, owner: string): Promise<OwnedAsset[]> {
  if (!owner) throw new Error('No wallet address provided');
  const client = getSuiClient(config);
  const balances: SuiClientTypes.Balance[] = [];
  let cursor: string | null = null;
  do {
    const page = await client.core.listBalances({ owner: normalizeSuiAddress(owner), cursor });
    balances.push(...page.balances);
    cursor = page.hasNextPage ? page.cursor : null;
  } while (cursor);

  const out: OwnedAsset[] = [];
  for (const b of balances) {
    let total: bigint;
    try {
      total = BigInt(b.balance);
    } catch {
      total = 0n;
    }
    if (total <= 0n) continue;

    const native = isSuiCoin(b.coinType);
    // Canonicalize the native coin so it matches the parser/ledger address.
    const address = native ? NATIVE_SUI_TYPE : b.coinType;
    const meta = await client.core
      .getCoinMetadata({ coinType: b.coinType })
      .then((r) => r.coinMetadata)
      .catch(() => null);
    const decimals = meta?.decimals ?? (native ? 9 : 0);
    out.push({
      chain: 'sui',
      address,
      symbol: meta?.symbol || (native ? 'SUI' : shortAddress(address)),
      name: meta?.name ?? (native ? 'Sui' : undefined),
      image: meta?.iconUrl || undefined, // gRPC returns "" (not null) when unset
      decimals,
      balance: Number(total) / 10 ** decimals,
      priceUsd: null,
    });
  }
  return out;
}

/** Metadata for one Sui coin type (manual flow). Null if not found. */
export async function getSuiCoinMeta(config: AppConfig, coinType: string): Promise<TokenMeta | null> {
  const native = isSuiCoin(coinType);
  const address = native ? NATIVE_SUI_TYPE : coinType;
  const meta = await getSuiClient(config)
    .core.getCoinMetadata({ coinType })
    .then((r) => r.coinMetadata)
    .catch(() => null);
  if (!meta && !native) return null;
  return {
    chain: 'sui',
    address,
    symbol: meta?.symbol || (native ? 'SUI' : shortAddress(address)),
    name: meta?.name ?? (native ? 'Sui' : undefined),
    image: meta?.iconUrl || undefined, // gRPC returns "" (not null) when unset
    decimals: meta?.decimals ?? (native ? 9 : 0),
  };
}

/** Live balance of one coin type for an owner, in whole coins (best-effort, null on failure). */
export async function getSuiTokenBalance(
  config: AppConfig,
  owner: string,
  coinType: string,
  decimals: number,
): Promise<number | null> {
  try {
    const { balance } = await getSuiClient(config).core.getBalance({
      owner: normalizeSuiAddress(owner),
      coinType,
    });
    return Number(BigInt(balance.balance)) / 10 ** decimals;
  } catch {
    return null;
  }
}
