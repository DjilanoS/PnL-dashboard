<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { Clock, LineChart, PieChart } from '@lucide/vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import HeroPnlCard from '@/components/HeroPnlCard.vue';
import TradeStats from '@/components/TradeStats.vue';
import HoldingsSection from '@/components/HoldingsSection.vue';
import PortfolioChart from '@/components/PortfolioChart.vue';
import AllocationDonut from '@/components/AllocationDonut.vue';
import RecentTransactions from '@/components/RecentTransactions.vue';
import { usePortfolio } from '@/stores/usePortfolio';
import { useOrders } from '@/stores/useOrders';

const { holdings, pnl, nav, loading: portfolioLoading, loaded: portfolioLoaded, fetchAll } =
  usePortfolio();
const { loading: ordersLoading, loaded: ordersLoaded, fetchOrders } = useOrders();

// First-load only: show skeletons until data lands, but never re-skeleton on the
// 60s background refresh (loaded stays true once the first fetch succeeds).
const portfolioPending = computed(() => portfolioLoading.value && !portfolioLoaded.value);
const ordersPending = computed(() => ordersLoading.value && !ordersLoaded.value);

const REFRESH_INTERVAL_MS = 60_000;
let refreshTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  fetchAll();
  // Drive the orders-backed sections' loading state from here, since those
  // components stay hidden behind skeletons until their data lands.
  void fetchOrders();
  refreshTimer = setInterval(fetchAll, REFRESH_INTERVAL_MS);
});

onUnmounted(() => clearInterval(refreshTimer));
</script>

<template>
  <div class="space-y-4">
    <!-- Row A: PnL (beams) + allocation, equal height -->
    <div class="grid gap-4 lg:grid-cols-3">
      <HeroPnlCard :pnl="pnl" class="lg:col-span-2" />

      <Card class="lg:col-span-1">
        <CardHeader class="pb-2">
          <CardTitle class="flex items-center gap-2 text-sm text-muted-foreground">
            <PieChart class="size-4" /> Allocation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div v-if="portfolioPending" class="flex h-64 flex-col items-center justify-center gap-4">
            <Skeleton class="size-40 rounded-full" />
            <div class="flex flex-wrap justify-center gap-2">
              <Skeleton v-for="i in 3" :key="i" class="h-4 w-16" />
            </div>
          </div>
          <AllocationDonut v-else :holdings="holdings?.holdings ?? []" />
        </CardContent>
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
          <div v-if="portfolioPending" class="space-y-2">
            <div class="flex gap-2">
              <Skeleton v-for="i in 4" :key="i" class="h-4 w-14" />
            </div>
            <Skeleton class="h-64 w-full" />
          </div>
          <PortfolioChart v-else :points="nav?.points ?? []" :holdings="holdings?.holdings ?? []" />
        </CardContent>
      </Card>

      <Card class="lg:col-span-1">
        <CardHeader class="pb-2">
          <CardTitle class="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock class="size-4" /> Recent activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div v-if="ordersPending" class="flex flex-col gap-1">
            <div v-for="i in 5" :key="i" class="flex items-center gap-3 px-2 py-2">
              <Skeleton class="size-7 shrink-0 rounded-full" />
              <Skeleton class="size-5 shrink-0 rounded-full" />
              <div class="min-w-0 space-y-1.5">
                <Skeleton class="h-3.5 w-24" />
                <Skeleton class="h-3 w-16" />
              </div>
              <div class="ml-auto space-y-1.5">
                <Skeleton class="ml-auto h-3.5 w-16" />
                <Skeleton class="ml-auto h-3 w-12" />
              </div>
            </div>
          </div>
          <RecentTransactions v-else />
        </CardContent>
      </Card>
    </div>

    <!-- Row C: trade stats -->
    <div v-if="portfolioPending || ordersPending" class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <div v-for="i in 4" :key="i" class="gloss space-y-2 rounded-xl p-4">
        <Skeleton class="h-4 w-24" />
        <Skeleton class="h-7 w-20" />
      </div>
    </div>
    <TradeStats v-else :pnl="pnl" />

    <!-- Row D: holdings — cards / table toggle -->
    <div v-if="portfolioPending" class="space-y-4">
      <div class="flex items-center justify-between">
        <Skeleton class="h-7 w-28" />
        <Skeleton class="h-9 w-36" />
      </div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Skeleton v-for="i in 4" :key="i" class="h-28 w-full rounded-xl" />
      </div>
    </div>
    <HoldingsSection
      v-else
      :holdings="holdings?.holdings ?? []"
      :pnl="pnl"
      :points="nav?.points ?? []"
    />
  </div>
</template>
