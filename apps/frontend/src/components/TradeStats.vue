<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { ArrowLeftRight, BarChart3, TrendingDown, TrendingUp } from '@lucide/vue';
import type { AssetPnl, PnlSummary } from '@pnl/types';
import { useOrders } from '@/stores/useOrders';
import TokenIcon from '@/components/icons/TokenIcon.vue';
import { fmtSignedUsd, fmtUsdCompact } from '@/lib/format';

const props = defineProps<{ pnl: PnlSummary | null }>();

const { orders, fetchOrders } = useOrders();
onMounted(() => {
  void fetchOrders();
});

const totalTrades = computed(() => orders.value.length);
const totalVolume = computed(() =>
  orders.value.reduce((s, o) => s + Math.abs(o.amount * o.priceUsd), 0),
);

// Best / worst position by realized PnL (the closest proxy for "trade" with the
// available per-asset data). Best only counts wins, worst only counts losses —
// so neither card ever shows the wrong sign.
const assets = computed<AssetPnl[]>(() => props.pnl?.perAsset ?? []);
const best = computed(() => {
  const wins = assets.value.filter((a) => a.realized > 0);
  return wins.length ? wins.reduce((m, a) => (a.realized > m.realized ? a : m)) : null;
});
const worst = computed(() => {
  const losses = assets.value.filter((a) => a.realized < 0);
  return losses.length ? losses.reduce((m, a) => (a.realized < m.realized ? a : m)) : null;
});
</script>

<template>
  <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
    <!-- Total trades -->
    <div class="gloss rounded-xl p-4">
      <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
        <ArrowLeftRight class="size-4" /> Total trades
      </div>
      <div class="mt-2 text-2xl font-semibold tabular-nums">{{ totalTrades }}</div>
    </div>

    <!-- Total volume -->
    <div class="gloss rounded-xl p-4">
      <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
        <BarChart3 class="size-4" /> Total volume
      </div>
      <div class="mt-2 text-2xl font-semibold tabular-nums">{{ fmtUsdCompact(totalVolume) }}</div>
    </div>

    <!-- Best trade -->
    <div class="tint-profit rounded-xl p-4">
      <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
        <TrendingUp class="size-4" /> Best trade
      </div>
      <div v-if="best" class="mt-2 flex items-center gap-2">
        <TokenIcon :chain="best.chain" :asset="best.asset" :image="best.image" class="size-5" />
        <span class="truncate text-sm font-medium">{{ best.asset }}</span>
        <span class="ml-auto shrink-0 text-lg font-semibold tabular-nums text-profit">
          {{ fmtSignedUsd(best.realized) }}
        </span>
      </div>
      <div v-else class="mt-2 text-2xl font-semibold tabular-nums text-muted-foreground">—</div>
    </div>

    <!-- Worst trade -->
    <div class="tint-loss rounded-xl p-4">
      <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
        <TrendingDown class="size-4" /> Worst trade
      </div>
      <div v-if="worst" class="mt-2 flex items-center gap-2">
        <TokenIcon :chain="worst.chain" :asset="worst.asset" :image="worst.image" class="size-5" />
        <span class="truncate text-sm font-medium">{{ worst.asset }}</span>
        <span class="ml-auto shrink-0 text-lg font-semibold tabular-nums text-loss">
          {{ fmtSignedUsd(worst.realized) }}
        </span>
      </div>
      <div v-else class="mt-2 text-2xl font-semibold tabular-nums text-muted-foreground">—</div>
    </div>
  </div>
</template>
