<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { ArrowDownLeft, ArrowUpRight } from '@lucide/vue';
import { useOrders } from '@/stores/useOrders';
import TokenIcon from '@/components/icons/TokenIcon.vue';
import { cn } from '@/lib/utils';
import { fmtAssetQty, fmtAssetUsd, fmtDate } from '@/lib/format';

const { orders, fetchOrders } = useOrders();

// fetchOrders is loaded-guarded, so this is a no-op if the ledger is already cached.
onMounted(() => {
  void fetchOrders();
});

const recent = computed(() => orders.value.slice(0, 5));
</script>

<template>
  <div class="flex flex-col gap-1">
    <div
      v-for="o in recent"
      :key="o.id"
      class="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50"
    >
      <span
        :class="
          cn(
            'grid size-7 shrink-0 place-items-center rounded-full',
            o.side === 'buy' ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss',
          )
        "
      >
        <component :is="o.side === 'buy' ? ArrowDownLeft : ArrowUpRight" class="size-4" />
      </span>
      <TokenIcon :chain="o.chain" :asset="o.asset" :image="o.image" class="size-5" />
      <div class="min-w-0">
        <div class="truncate text-sm font-medium">
          <span class="capitalize">{{ o.side }}</span> {{ o.asset }}
        </div>
        <div class="truncate text-xs text-muted-foreground">{{ fmtDate(o.timestamp) }}</div>
      </div>
      <div class="ml-auto text-right">
        <div class="text-sm tabular-nums">{{ fmtAssetQty(o.amount, o.asset === 'USDC') }}</div>
        <div class="text-xs tabular-nums text-muted-foreground">@ {{ fmtAssetUsd(o.priceUsd, o.asset === 'USDC') }}</div>
      </div>
    </div>
    <p v-if="recent.length === 0" class="py-6 text-center text-sm text-muted-foreground">
      No transactions yet.
    </p>
  </div>
</template>
