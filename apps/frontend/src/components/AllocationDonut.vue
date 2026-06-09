<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Chain, Holding } from '@pnl/types';
import TokenIcon from '@/components/icons/TokenIcon.vue';
import { cn } from '@/lib/utils';
import { fmtUsd } from '@/lib/format';

const props = defineProps<{ holdings: Holding[] }>();

// Arbitrary tokens have no brand variable, so segments are colored by chain.
const CHAIN_COLOR: Record<Chain, string> = { sol: 'var(--solana)', sui: 'var(--sui)' };
// r chosen so the circumference ≈ 100 → dash lengths map directly to percentages.
const RADIUS = 15.91549430918954;

// Hovered token, keyed by `${chain}:${address}`.
const hovered = ref<string | null>(null);

const segments = computed(() => {
  const items = props.holdings.filter((h) => h.valueUsd > 0);
  const total = items.reduce((s, h) => s + h.valueUsd, 0);
  let acc = 0;
  const arcs = items.map((h) => {
    const pct = total > 0 ? h.valueUsd / total : 0;
    const len = pct * 100;
    // +25 rotates the start to 12 o'clock, going clockwise (matches a conic gradient).
    const offset = 100 - acc + 25;
    acc += len;
    return {
      key: `${h.chain}:${h.address}`,
      chain: h.chain,
      symbol: h.asset,
      image: h.image,
      color: CHAIN_COLOR[h.chain],
      value: h.valueUsd,
      pct,
      len,
      offset,
    };
  });
  return { total, arcs };
});

// Center label/value: the hovered token, or the portfolio total when nothing is hovered.
const center = computed(() => {
  const seg = hovered.value ? segments.value.arcs.find((a) => a.key === hovered.value) : null;
  if (!seg) return { label: 'Total', chain: undefined, image: undefined, value: segments.value.total };
  return { label: seg.symbol, chain: seg.chain, image: seg.image, value: seg.value };
});
</script>

<template>
  <div v-if="segments.arcs.length" class="flex h-64 flex-col items-center justify-center gap-4">
    <div class="relative size-40">
      <svg viewBox="0 0 42 42" class="size-40">
        <circle
          v-for="seg in segments.arcs"
          :key="seg.key"
          cx="21"
          cy="21"
          :r="RADIUS"
          fill="none"
          :stroke="seg.color"
          :stroke-width="hovered === seg.key ? 5 : 4"
          :stroke-dasharray="`${seg.len} ${100 - seg.len}`"
          :stroke-dashoffset="seg.offset"
          :class="cn(
            'cursor-pointer transition-all duration-150',
            hovered && hovered !== seg.key && 'opacity-30',
          )"
          @mouseenter="hovered = seg.key"
          @mouseleave="hovered = null"
        />
      </svg>
      <!-- pointer-events-none so the ring underneath stays hoverable -->
      <div class="pointer-events-none absolute inset-0 grid place-items-center">
        <div class="text-center">
          <div class="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <TokenIcon v-if="center.chain" :chain="center.chain" :image="center.image" class="size-3" />
            {{ center.label }}
          </div>
          <div class="text-sm font-semibold tabular-nums">{{ fmtUsd(center.value) }}</div>
        </div>
      </div>
    </div>
    <div class="flex flex-wrap justify-center gap-2 text-sm">
      <div
        v-for="s in segments.arcs"
        :key="s.key"
        class="flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent"
        @mouseenter="hovered = s.key"
        @mouseleave="hovered = null"
      >
        <TokenIcon :chain="s.chain" :image="s.image" class="size-3.5" />
        <span :class="s.chain === 'sol' ? 'text-solana' : 'text-sui'">{{ s.symbol }}</span>
        <span class="text-muted-foreground">{{ (s.pct * 100).toFixed(1) }}%</span>
      </div>
    </div>
  </div>
  <div v-else class="grid h-64 place-items-center text-sm text-muted-foreground">
    No holdings yet.
  </div>
</template>
