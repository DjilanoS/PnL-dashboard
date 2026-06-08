<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { Coins, LineChart, PieChart, Wallet } from '@lucide/vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PnlCards from '@/components/PnlCards.vue';
import HoldingsTable from '@/components/HoldingsTable.vue';
import PortfolioChart from '@/components/PortfolioChart.vue';
import AllocationDonut from '@/components/AllocationDonut.vue';
import { usePortfolio } from '@/stores/usePortfolio';
import { fmtUsd } from '@/lib/format';

const { holdings, pnl, nav, fetchAll } = usePortfolio();

const REFRESH_INTERVAL_MS = 60_000;
let refreshTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  fetchAll();
  refreshTimer = setInterval(fetchAll, REFRESH_INTERVAL_MS);
});

onUnmounted(() => clearInterval(refreshTimer));
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-end justify-between">
      <h1 class="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <Card v-if="holdings" class="gap-1 px-4 py-3 text-right">
        <div class="flex items-center justify-end gap-1 text-xs text-muted-foreground">
          <Wallet class="size-3.5" /> Portfolio value
        </div>
        <div class="text-xl font-semibold tabular-nums">{{ fmtUsd(holdings.totalValueUsd) }}</div>
      </Card>
    </div>

    <!-- Row 1: PnL cards -->
    <PnlCards :pnl="pnl" />

    <!-- Row 2: portfolio chart + allocation -->
    <div class="grid gap-4 lg:grid-cols-3">
      <Card class="lg:col-span-2">
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <LineChart class="size-4 text-muted-foreground" /> Portfolio Value
          </CardTitle>
        </CardHeader>
        <CardContent><PortfolioChart :points="nav?.points ?? []" /></CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <PieChart class="size-4 text-muted-foreground" /> Allocation
          </CardTitle>
        </CardHeader>
        <CardContent><AllocationDonut :holdings="holdings?.holdings ?? []" /></CardContent>
      </Card>
    </div>

    <!-- Row 3: holdings -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Coins class="size-4 text-muted-foreground" /> Holdings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <HoldingsTable :holdings="holdings?.holdings ?? []" :pnl="pnl" />
      </CardContent>
    </Card>
  </div>
</template>
