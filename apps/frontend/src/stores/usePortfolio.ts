import { ref } from 'vue';
import type { HoldingsResponse, PnlRange, PnlSummary, TimeseriesResponse, NavRange } from '@pnl/types';
import { api } from '@/lib/api';

// Module-level singleton (no Pinia).
const holdings = ref<HoldingsResponse | null>(null);
const pnl = ref<PnlSummary | null>(null);
// Time-windowed PnL for the hero card (the rest of the dashboard uses `pnl`).
const pnlRange = ref<PnlRange>('24h');
const pnlWindow = ref<PnlSummary | null>(null);
const nav = ref<TimeseriesResponse | null>(null);
const loading = ref(false);
const loaded = ref(false);

// Refetch the hero card's windowed PnL. Keeps the previous value on failure so
// switching ranges (or the periodic refresh) never flickers to a placeholder.
async function fetchPnl(range: PnlRange): Promise<void> {
  pnlWindow.value = await api
    .get<PnlSummary>(`/pnl/summary?range=${range}`)
    .catch(() => pnlWindow.value);
}

function setPnlRange(range: PnlRange): void {
  pnlRange.value = range;
  void fetchPnl(range);
}

async function fetchAll(range: NavRange = '30d'): Promise<void> {
  loading.value = true;
  try {
    const [h, p, n] = await Promise.all([
      api.get<HoldingsResponse>('/holdings'),
      api.get<PnlSummary>('/pnl/summary'),
      api.get<TimeseriesResponse>(`/portfolio/timeseries?range=${range}`).catch(() => null),
      fetchPnl(pnlRange.value),
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
  return { holdings, pnl, pnlWindow, pnlRange, nav, loading, loaded, fetchAll, fetchPnl, setPnlRange };
}
