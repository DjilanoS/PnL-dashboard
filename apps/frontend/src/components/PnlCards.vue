<script setup lang="ts">
import { computed } from 'vue';
import {
  CircleDollarSign,
  Hourglass,
  Percent,
  TrendingDown,
  TrendingUp,
  Wallet,
} from '@lucide/vue';
import type { PnlSummary } from '@pnl/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { fmtPct, fmtSignedUsd } from '@/lib/format';

const props = defineProps<{ pnl: PnlSummary | null }>();

function toneClass(n: number): string {
  return n > 0 ? 'text-profit' : n < 0 ? 'text-loss' : '';
}

function cardClass(n: number): string {
  return n > 0 ? 'card-profit' : n < 0 ? 'card-loss' : '';
}

const cards = computed(() => {
  const p = props.pnl;
  if (!p) return [];
  return [
    { label: 'Total PnL', value: fmtSignedUsd(p.total), n: p.total, icon: Wallet },
    { label: 'Realized', value: fmtSignedUsd(p.realized), n: p.realized, icon: CircleDollarSign },
    { label: 'Unrealized', value: fmtSignedUsd(p.unrealized), n: p.unrealized, icon: Hourglass },
    { label: 'ROI', value: fmtPct(p.roi), n: p.roi, icon: Percent },
  ];
});
</script>

<template>
  <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
    <template v-if="pnl">
      <Card v-for="c in cards" :key="c.label" :class="cn('transition-colors', cardClass(c.n))">
        <CardHeader class="pb-2">
          <CardTitle class="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <component :is="c.icon" class="size-4" />
            {{ c.label }}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <span :class="cn('flex items-center gap-1.5 text-xl font-semibold tabular-nums sm:text-2xl', toneClass(c.n))">
            {{ c.value }}
            <TrendingUp v-if="c.n > 0" class="size-5" />
            <TrendingDown v-else-if="c.n < 0" class="size-5" />
          </span>
        </CardContent>
      </Card>
    </template>
    <template v-else>
      <Card v-for="i in 4" :key="i">
        <CardHeader class="pb-2"><Skeleton class="h-4 w-20" /></CardHeader>
        <CardContent><Skeleton class="h-7 w-24" /></CardContent>
      </Card>
    </template>
  </div>
</template>
