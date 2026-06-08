import { ref } from 'vue';
import type {
  Chain,
  Order,
  ParseResponse,
  ParsedOrderPreview,
  ScanResponse,
} from '@pnl/types';
import { api } from '@/lib/api';
import { useOrders } from '@/stores/useOrders';

export function useTxImport() {
  const parsing = ref(false);
  const scanning = ref(false);
  const importing = ref(false);

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

  return { parsing, scanning, importing, parse, scan, importCandidate, importLink };
}
