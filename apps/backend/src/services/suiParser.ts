import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import type { SuiTransactionBlockResponse } from '@mysten/sui/jsonRpc';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import {
  NATIVE_SUI_TYPE,
  shortAddress,
  type OwnedAsset,
  type ParsedOrderPreview,
  type TokenMeta,
} from '@pnl/types';
import type { AppConfig } from '../config/env';
import { getHistoricalPriceForToken } from './prices';

// Cache one client per RPC URL so per-user custom endpoints don't collide.
const clientsByUrl = new Map<string, SuiJsonRpcClient>();
export function getSuiClient(config: AppConfig): SuiJsonRpcClient {
  const url = config.SUI_RPC_URL || getJsonRpcFullnodeUrl('mainnet');
  let client = clientsByUrl.get(url);
  if (!client) {
    client = new SuiJsonRpcClient({ url, network: 'mainnet' });
    clientsByUrl.set(url, client);
  }
  return client;
}
const suiClient = getSuiClient;

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
export function suiDeltaForUser(
  tx: SuiTransactionBlockResponse,
  user: string,
): { sui: number; gas: number } {
  const addr = normalizeSuiAddress(user);
  let mist = 0n;
  for (const bc of tx.balanceChanges ?? []) {
    const owner = bc.owner;
    const ownerAddr =
      typeof owner === 'object' && owner !== null && 'AddressOwner' in owner
        ? owner.AddressOwner
        : null;
    if (ownerAddr && normalizeSuiAddress(ownerAddr) === addr && isSuiCoin(bc.coinType)) {
      mist += BigInt(bc.amount);
    }
  }
  const g = tx.effects?.gasUsed;
  const gas = g
    ? BigInt(g.computationCost) + BigInt(g.storageCost) - BigInt(g.storageRebate)
    : 0n;
  return { sui: Number(mist + gas) / 1e9, gas: Number(gas) / 1e9 };
}

export async function parseSuiTx(
  tx: SuiTransactionBlockResponse,
  user: string,
): Promise<ParsedOrderPreview | null> {
  if (!user) return null;
  if (tx.effects?.status?.status !== 'success') return null;

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
  const tx = await suiClient(config).getTransactionBlock({
    digest,
    options: { showBalanceChanges: true, showEffects: true, showInput: true },
  });
  const sender = tx.transaction?.data?.sender;
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
  const res = await suiClient(config).queryTransactionBlocks({
    filter: { FromAddress: normalizeSuiAddress(user) },
    options: { showBalanceChanges: true, showEffects: true },
    limit,
    order: 'descending',
  });

  const out: ParsedOrderPreview[] = [];
  for (const tx of res.data) {
    const preview = await parseSuiTx(tx, user);
    if (preview) out.push(preview);
  }
  return out;
}

// --- Sui coin discovery (the equivalent of Helius DAS for Sui) ---

/** All coin balances held by `owner` → OwnedAsset rows. Prices filled by the caller. */
export async function getSuiAssetsByOwner(config: AppConfig, owner: string): Promise<OwnedAsset[]> {
  if (!owner) throw new Error('No wallet address provided');
  const client = getSuiClient(config);
  const balances = await client.getAllBalances({ owner: normalizeSuiAddress(owner) });

  const out: OwnedAsset[] = [];
  for (const b of balances) {
    let total: bigint;
    try {
      total = BigInt(b.totalBalance);
    } catch {
      total = 0n;
    }
    if (total <= 0n) continue;

    const native = isSuiCoin(b.coinType);
    // Canonicalize the native coin so it matches the parser/ledger address.
    const address = native ? NATIVE_SUI_TYPE : b.coinType;
    const meta = await client.getCoinMetadata({ coinType: b.coinType }).catch(() => null);
    const decimals = meta?.decimals ?? (native ? 9 : 0);
    out.push({
      chain: 'sui',
      address,
      symbol: meta?.symbol || (native ? 'SUI' : shortAddress(address)),
      name: meta?.name ?? (native ? 'Sui' : undefined),
      image: meta?.iconUrl ?? undefined,
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
  const meta = await getSuiClient(config).getCoinMetadata({ coinType }).catch(() => null);
  if (!meta && !native) return null;
  return {
    chain: 'sui',
    address,
    symbol: meta?.symbol || (native ? 'SUI' : shortAddress(address)),
    name: meta?.name ?? (native ? 'Sui' : undefined),
    image: meta?.iconUrl ?? undefined,
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
    const bal = await getSuiClient(config).getBalance({ owner: normalizeSuiAddress(owner), coinType });
    return Number(BigInt(bal.totalBalance)) / 10 ** decimals;
  } catch {
    return null;
  }
}
