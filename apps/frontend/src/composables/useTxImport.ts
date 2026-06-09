import { ref } from 'vue';
import type {
  AssetsScanResponse,
  Chain,
  Order,
  OwnedAsset,
  ParseResponse,
  ParsedOrderPreview,
  ScanResponse,
  TokenLookupResponse,
} from '@pnl/types';
import { api } from '@/lib/api';
import { useOrders } from '@/stores/useOrders';

export function useTxImport() {
  const parsing = ref(false);
  const scanning = ref(false);
  const importing = ref(false);
  const fetchingAssets = ref(false);
  const lookingUp = ref(false);

  /** Fetch the tokens held across the user's wallets on a chain (Scan-assets flow). */
  async function fetchAssets(chain: Chain): Promise<OwnedAsset[]> {
    fetchingAssets.value = true;
    try {
      const res = await api.post<AssetsScanResponse>('/tx/assets', { chain });
      return res.assets;
    } finally {
      fetchingAssets.value = false;
    }
  }

  /** Look up one token's metadata + price by address (Manual flow). */
  async function lookupToken(chain: Chain, address: string): Promise<TokenLookupResponse> {
    lookingUp.value = true;
    try {
      return await api.post<TokenLookupResponse>('/tx/token', { chain, address });
    } finally {
      lookingUp.value = false;
    }
  }

  async function parse(chain: Chain, urlOrSig: string, address?: string): Promise<ParsedOrderPreview> {
    parsing.value = true;
    try {
      const res = await api.post<ParseResponse>('/tx/parse', { chain, urlOrSig, address: address || undefined });
      return res.preview;
    } finally {
      parsing.value = false;
    }
  }

  async function scan(chain: Chain, address?: string): Promise<ParsedOrderPreview[]> {
    scanning.value = true;
    try {
      const res = await api.post<ScanResponse>('/tx/scan', { chain, address: address || undefined });
      return res.candidates;
    } finally {
      scanning.value = false;
    }
  }

  async function importCandidate(chain: Chain, candidate: ParsedOrderPreview): Promise<Order> {
    importing.value = true;
    try {
      const order = await api.post<Order>('/tx/import', { chain, candidate });
      useOrders().upsertOrder(order);
      return order;
    } finally {
      importing.value = false;
    }
  }

  async function importLink(chain: Chain, urlOrSig: string, address?: string): Promise<Order> {
    importing.value = true;
    try {
      const order = await api.post<Order>('/tx/import', { chain, urlOrSig, address: address || undefined });
      useOrders().upsertOrder(order);
      return order;
    } finally {
      importing.value = false;
    }
  }

  return {
    parsing,
    scanning,
    importing,
    fetchingAssets,
    lookingUp,
    parse,
    scan,
    fetchAssets,
    lookupToken,
    importCandidate,
    importLink,
  };
}
