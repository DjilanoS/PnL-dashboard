<script setup lang="ts">
import { onMounted } from 'vue';
import { Plus } from '@lucide/vue';
import { toast } from 'vue-sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import AddOrderDialog from '@/components/AddOrderDialog.vue';
import TxHistoryTable from '@/components/TxHistoryTable.vue';
import { useOrders } from '@/stores/useOrders';

const { orders, loading, loaded, fetchOrders, removeOrder } = useOrders();

onMounted(() => fetchOrders());

async function onDelete(id: string): Promise<void> {
  if (!window.confirm('Delete this order? This cannot be undone.')) return;
  try {
    await removeOrder(id);
    toast.success('Order deleted');
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Failed to delete order');
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold tracking-tight">Orders</h1>
      <AddOrderDialog>
        <Button class="gap-2">
          <Plus class="size-4" />
          Add Order
        </Button>
      </AddOrderDialog>
    </div>

    <div v-if="loading && !loaded" class="space-y-3">
      <Skeleton v-for="i in 5" :key="i" class="h-12 w-full" />
    </div>
    <TxHistoryTable v-else :orders="orders" @delete="onDelete" />
  </div>
</template>
