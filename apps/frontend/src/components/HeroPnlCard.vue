<script setup lang="ts">
import { computed } from 'vue';
import type { PnlSummary } from '@pnl/types';
import Beams from '@/components/Beams.vue';
import { cn } from '@/lib/utils';
import { fmtPct, fmtSignedUsd } from '@/lib/format';

const props = defineProps<{ pnl: PnlSummary | null }>();

const total = computed(() => props.pnl?.total ?? 0);
const positive = computed(() => total.value >= 0);
// Beams parse a hex literal (no CSS vars), so mirror --profit / --loss here.
const beamColor = computed(() => (positive.value ? '#34d399' : '#f6465d'));

// Up → green, down → red, flat (0) → white.
function toneOf(n: number): string {
  return n > 0 ? 'text-profit' : n < 0 ? 'text-loss' : 'text-foreground';
}
const headlineTone = computed(() => toneOf(total.value));

const pillClass =
  'inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm';
</script>

<template>
  <div class="gloss relative flex h-full min-h-52 flex-col justify-between overflow-hidden rounded-xl p-5">
    <!-- WebGL beams background -->
    <div class="absolute inset-0">
      <Beams
        :beam-width="3"
        :beam-height="15"
        :beam-number="12"
        :light-color="beamColor"
        :speed="1"
        :noise-intensity="1.75"
        :scale="0.2"
        :rotation="30"
      />
    </div>
    <!-- scrim so the PnL text stays legible over the beams -->
    <div
      class="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/85 via-black/45 to-transparent"
    />

    <div class="relative">
      <span class="text-sm font-medium text-muted-foreground">Current PnL</span>
      <div :class="cn('mt-1 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl', headlineTone)">
        {{ pnl ? fmtPct(pnl.roi) : '—' }}
      </div>
      <div v-if="pnl" :class="cn('mt-0.5 text-lg font-semibold tabular-nums', headlineTone)">
        {{ fmtSignedUsd(pnl.total) }}
      </div>
    </div>

    <div v-if="pnl" class="relative mt-5 flex flex-wrap gap-2">
      <span :class="pillClass">
        ROI <span class="font-semibold" :class="toneOf(pnl.roi)">{{ fmtPct(pnl.roi) }}</span>
      </span>
      <span :class="pillClass">
        Realized
        <span class="font-semibold" :class="toneOf(pnl.realized)">{{ fmtSignedUsd(pnl.realized) }}</span>
      </span>
      <span :class="pillClass">
        Unrealized
        <span class="font-semibold" :class="toneOf(pnl.unrealized)">{{ fmtSignedUsd(pnl.unrealized) }}</span>
      </span>
    </div>
  </div>
</template>
