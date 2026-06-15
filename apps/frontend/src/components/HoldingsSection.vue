<script setup lang="ts">
import { Coins } from '@lucide/vue';
import type { Holding, NavPoint, PnlSummary } from '@pnl/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import HoldingCard from '@/components/HoldingCard.vue';
import HoldingsTable from '@/components/HoldingsTable.vue';

const props = defineProps<{ holdings: Holding[]; pnl: PnlSummary | null; points: NavPoint[] }>();

// Per-asset value-over-time from the NAV breakdown (keyed by chain + symbol).
function seriesFor(h: Holding): number[] {
  return props.points.map(
    (p) => p.breakdown.find((b) => b.chain === h.chain && b.asset === h.asset)?.valueUsd ?? 0,
  );
}
</script>

<template>
  <Tabs default-value="cards" class="gap-4">
    <div class="flex items-center justify-between">
      <h2 class="flex items-center gap-2 text-lg font-semibold">
        <Coins class="size-5 text-muted-foreground" /> Holdings
      </h2>
      <TabsList>
        <TabsTrigger value="cards">Cards</TabsTrigger>
        <TabsTrigger value="table">Table</TabsTrigger>
      </TabsList>
    </div>

    <TabsContent value="cards">
      <div v-if="holdings.length" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <HoldingCard
          v-for="h in holdings"
          :key="`${h.chain}:${h.address}`"
          :holding="h"
          :series="seriesFor(h)"
        />
      </div>
      <p
        v-else
        class="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground"
      >
        No holdings yet. Add orders to see your positions.
      </p>
    </TabsContent>

    <TabsContent value="table">
      <HoldingsTable :holdings="holdings" :pnl="pnl" />
    </TabsContent>
  </Tabs>
</template>
