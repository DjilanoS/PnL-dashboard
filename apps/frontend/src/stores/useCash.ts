import { ref } from 'vue';
import type { CashAdjustment, CashAdjustmentInput } from '@pnl/types';
import { api } from '@/lib/api';

// Module-level singleton store for manual USDC balance adjustments.
const adjustments = ref<CashAdjustment[]>([]);
const loaded = ref(false);

async function fetchAdjustments(force = false): Promise<void> {
  if (loaded.value && !force) return;
  adjustments.value = await api.get<CashAdjustment[]>('/cash/adjustments');
  loaded.value = true;
}

async function addAdjustment(input: CashAdjustmentInput): Promise<CashAdjustment> {
  const created = await api.post<CashAdjustment>('/cash/adjustments', input);
  adjustments.value = [created, ...adjustments.value];
  return created;
}

async function removeAdjustment(id: string): Promise<void> {
  await api.del(`/cash/adjustments/${id}`);
  adjustments.value = adjustments.value.filter((a) => a.id !== id);
}

export function useCash() {
  return { adjustments, loaded, fetchAdjustments, addAdjustment, removeAdjustment };
}
