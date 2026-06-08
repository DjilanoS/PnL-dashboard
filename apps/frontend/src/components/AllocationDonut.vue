<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Asset, Holding } from '@pnl/types';
import TokenIcon from '@/components/icons/TokenIcon.vue';
import { cn } from '@/lib/utils';
import { fmtUsd } from '@/lib/format';

const props = defineProps<{ holdings: Holding[] }>();

const COLOR: Record<string, string> = { SOL: 'var(--solana)', SUI: 'var(--sui)' };
// r chosen so the circumference ≈ 100 → dash lengths map directly to percentages.
const RADIUS = 15.91549430918954;

const hovered = ref<Asset | null>(null);

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
    return { asset: h.asset, value: h.valueUsd, pct, len, offset };
  });
  return { total, arcs };
});

// Center label/value: the hovered asset, or the portfolio total when nothing is hovered.
const center = computed(() => {
  const h = hovered.value;
  if (!h) return { label: 'Total', value: segments.value.total };
  return { label: h, value: segments.value.arcs.find((a) => a.asset === h)?.value ?? 0 };
});
</script>

<template>
  <div v-if="segments.arcs.length" class="flex h-64 flex-col items-center justify-center gap-4">
    <div class="relative size-40">
      <svg viewBox="0 0 42 42" class="size-40">
        <circle
          v-for="seg in segments.arcs"
          :key="seg.asset"
          cx="21"
          cy="21"
          :r="RADIUS"
          fill="none"
          :stroke="COLOR[seg.asset]"
          :stroke-width="hovered === seg.asset ? 5 : 4"
          :stroke-dasharray="`${seg.len} ${100 - seg.len}`"
          :stroke-dashoffset="seg.offset"
          :class="cn(
            'cursor-pointer transition-all duration-150',
            hovered && hovered !== seg.asset && 'opacity-30',
          )"
          @mouseenter="hovered = seg.asset"
          @mouseleave="hovered = null"
        />
      </svg>
      <!-- pointer-events-none so the ring underneath stays hoverable -->
      <div class="pointer-events-none absolute inset-0 grid place-items-center">
        <div class="text-center">
          <div class="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <TokenIcon v-if="hovered" :asset="hovered" class="size-3" />
            {{ center.label }}
          </div>
          <div class="text-sm font-semibold tabular-nums">{{ fmtUsd(center.value) }}</div>
        </div>
      </div>
    </div>
    <div class="flex flex-wrap justify-center gap-2 text-sm">
      <div
        v-for="s in segments.arcs"
        :key="s.asset"
        class="flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent"
        @mouseenter="hovered = s.asset"
        @mouseleave="hovered = null"
      >
        <TokenIcon :asset="s.asset" class="size-3.5" />
        <span :class="s.asset === 'SOL' ? 'text-solana' : 'text-sui'">{{ s.asset }}</span>
        <span class="text-muted-foreground">{{ (s.pct * 100).toFixed(1) }}%</span>
      </div>
    </div>
  </div>
  <div v-else class="grid h-64 place-items-center text-sm text-muted-foreground">
    No holdings yet.
  </div>
</template>
