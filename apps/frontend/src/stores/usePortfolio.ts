import { ref } from 'vue';
import type { HoldingsResponse, PnlSummary, TimeseriesResponse, NavRange } from '@pnl/types';
import { api } from '@/lib/api';

// Module-level singleton (no Pinia).
const holdings = ref<HoldingsResponse | null>(null);
const pnl = ref<PnlSummary | null>(null);
const nav = ref<TimeseriesResponse | null>(null);
const loading = ref(false);
const loaded = ref(false);

async function fetchAll(range: NavRange = '30d'): Promise<void> {
  loading.value = true;
  try {
    const [h, p, n] = await Promise.all([
      api.get<HoldingsResponse>('/holdings'),
      api.get<PnlSummary>('/pnl/summary'),
      api.get<TimeseriesResponse>(`/portfolio/timeseries?range=${range}`).catch(() => null),
    ]);
    holdings.value = h;
    pnl.value = p;
    nav.value = n;
    loaded.value = true;
  } finally {
    loading.value = false;
  }
}

export function usePortfolio() {
  return { holdings, pnl, nav, loading, loaded, fetchAll };
}
