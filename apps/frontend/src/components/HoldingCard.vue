<script setup lang="ts">
import { computed } from 'vue';
import { Pencil } from '@lucide/vue';
import type { Holding } from '@pnl/types';
import TokenIcon from '@/components/icons/TokenIcon.vue';
import Sparkline from '@/components/Sparkline.vue';
import AdjustCashDialog from '@/components/AdjustCashDialog.vue';
import { useTokenColor } from '@/composables/useTokenColor';
import { knownTokenLogo } from '@/lib/tokenLogos';
import { fmtNum, fmtSignedUsd, fmtUsd } from '@/lib/format';

const props = defineProps<{ holding: Holding; series: number[] }>();

// The synthetic USDC cash position can be hand-adjusted (deposits/withdrawals).
const isUsdc = computed(() => props.holding.asset === 'USDC');

// Resolve a logo (API image → known SOL/SUI/USDC logo) for both the color + icon.
const resolvedImage = computed(() => props.holding.image || knownTokenLogo(props.holding.asset));
const color = useTokenColor(
  () => resolvedImage.value,
  () => props.holding.chain,
  () => props.holding.asset,
);

// Fully-sold positions (qty ~0) lead with their realized PnL instead of value.
const closed = computed(() => props.holding.ledgerQty <= 1e-9);
const unrealized = computed(() => props.holding.unrealized);

function toneOf(n: number): string {
  return n > 0 ? 'text-profit' : n < 0 ? 'text-loss' : 'text-muted-foreground';
}

const pct = computed(() =>
  props.holding.costBasis > 0 ? unrealized.value / props.holding.costBasis : 0,
);
const pctLabel = computed(() => `${pct.value > 0 ? '+' : ''}${(pct.value * 100).toFixed(1)}%`);
</script>

<template>
  <div class="gloss flex flex-col gap-3 rounded-xl p-4">
    <div class="flex items-center gap-2">
      <TokenIcon :chain="holding.chain" :asset="holding.asset" :image="holding.image" class="size-7" />
      <div class="min-w-0">
        <div class="truncate text-sm font-semibold leading-tight">{{ holding.asset }}</div>
        <div v-if="holding.name" class="truncate text-xs text-muted-foreground">{{ holding.name }}</div>
      </div>
      <span class="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
        {{ (holding.allocation * 100).toFixed(1) }}%
      </span>
      <AdjustCashDialog v-if="isUsdc" :current-balance="holding.valueUsd">
        <button
          type="button"
          class="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Adjust USDC balance"
          @click.stop
        >
          <Pencil class="size-3.5" />
        </button>
      </AdjustCashDialog>
    </div>

    <div class="flex items-baseline gap-2">
      <span class="text-lg font-semibold tabular-nums" :class="closed ? toneOf(holding.realized) : ''">
        {{ closed ? fmtSignedUsd(holding.realized) : fmtUsd(holding.valueUsd) }}
      </span>
      <span v-if="!closed" class="truncate text-sm tabular-nums text-muted-foreground">
        {{ fmtNum(holding.ledgerQty) }} {{ holding.asset }}
      </span>
    </div>

    <Sparkline :data="series" :color="color" />

    <div class="flex items-center justify-between text-xs tabular-nums">
      <template v-if="closed">
        <span class="text-muted-foreground">Realized</span>
        <span class="text-muted-foreground">Closed</span>
      </template>
      <template v-else>
        <span :class="toneOf(unrealized)">{{ fmtSignedUsd(unrealized) }}</span>
        <span :class="toneOf(unrealized)">{{ pctLabel }}</span>
      </template>
    </div>
  </div>
</template>
