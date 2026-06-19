<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { Clock, LineChart, PieChart } from '@lucide/vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import HeroPnlCard from '@/components/HeroPnlCard.vue';
import TradeStats from '@/components/TradeStats.vue';
import HoldingsSection from '@/components/HoldingsSection.vue';
import PortfolioChart from '@/components/PortfolioChart.vue';
import AllocationDonut from '@/components/AllocationDonut.vue';
import RecentTransactions from '@/components/RecentTransactions.vue';
import { usePortfolio } from '@/stores/usePortfolio';

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
  <div class="space-y-4">
    <!-- Row A: PnL (beams) + allocation, equal height -->
    <div class="grid gap-4 lg:grid-cols-3">
      <HeroPnlCard class="lg:col-span-2" />

      <Card class="lg:col-span-1">
        <CardHeader class="pb-2">
          <CardTitle class="flex items-center gap-2 text-sm text-muted-foreground">
            <PieChart class="size-4" /> Allocation
          </CardTitle>
        </CardHeader>
        <CardContent><AllocationDonut :holdings="holdings?.holdings ?? []" /></CardContent>
      </Card>
    </div>

    <!-- Row B: portfolio value graph + recent activity -->
    <div class="grid gap-4 lg:grid-cols-3">
      <Card class="lg:col-span-2">
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <LineChart class="size-4 text-muted-foreground" /> Portfolio Value
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PortfolioChart :points="nav?.points ?? []" :holdings="holdings?.holdings ?? []" />
        </CardContent>
      </Card>

      <Card class="lg:col-span-1">
        <CardHeader class="pb-2">
          <CardTitle class="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock class="size-4" /> Recent activity
          </CardTitle>
        </CardHeader>
        <CardContent><RecentTransactions /></CardContent>
      </Card>
    </div>

    <!-- Row C: trade stats -->
    <TradeStats :pnl="pnl" />

    <!-- Row D: holdings — cards / table toggle -->
    <HoldingsSection :holdings="holdings?.holdings ?? []" :pnl="pnl" :points="nav?.points ?? []" />
  </div>
</template>
