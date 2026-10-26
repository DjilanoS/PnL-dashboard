import { ref } from 'vue';
import type { ManualOrderInput, Order } from '@pnl/types';
import { api } from '@/lib/api';

// Module-level singleton ledger store (no Pinia).
const orders = ref<Order[]>([]);
const loading = ref(false);
const loaded = ref(false);

// Shared in-flight request, so concurrent callers (the dashboard and its
// orders-backed children all fetch on mount) trigger a single GET /orders.
let inflight: Promise<void> | null = null;

async function fetchOrders(force = false): Promise<void> {
  if (loaded.value && !force) return;
  if (inflight) return inflight;
  inflight = (async () => {
    loading.value = true;
    try {
      orders.value = await api.get<Order[]>('/orders');
      loaded.value = true;
    } finally {
      loading.value = false;
      inflight = null;
    }
  })();
  return inflight;
}

async function addOrder(input: ManualOrderInput): Promise<Order> {
  const created = await api.post<Order>('/orders', input);
  orders.value = [created, ...orders.value];
  return created;
}

async function updateOrder(id: string, input: ManualOrderInput): Promise<Order> {
  const updated = await api.patch<Order>(`/orders/${id}`, input);
  orders.value = orders.value
    .map((o) => (o.id === id ? updated : o))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return updated;
}

async function removeOrder(id: string): Promise<void> {
  await api.del(`/orders/${id}`);
  orders.value = orders.value.filter((o) => o.id !== id);
}

/** Insert an order (from tx import) into the list, de-duplicating by id. */
function upsertOrder(order: Order): void {
  const without = orders.value.filter((o) => o.id !== order.id);
  orders.value = [order, ...without].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function useOrders() {
  return { orders, loading, loaded, fetchOrders, addOrder, updateOrder, removeOrder, upsertOrder };
}
