<script setup lang="ts">
import { computed, useId } from 'vue';

// Lightweight inline-SVG sparkline. Deliberately NOT lightweight-charts: a card
// grid would otherwise spin up one IChartApi (canvas + ResizeObserver) per card.
const props = withDefaults(
  defineProps<{ data: number[]; color: string; width?: number; height?: number }>(),
  { width: 140, height: 40 },
);

// Unique gradient id per instance so <defs> don't collide across many cards.
const gradId = `spark-${useId()}`;

const geom = computed(() => {
  const d = props.data;
  if (d.length < 2) return null;
  const min = Math.min(...d);
  const max = Math.max(...d);
  const span = max - min || 1;
  const { width: W, height: H } = props;
  const pad = 3;
  const x = (i: number): number => (i / (d.length - 1)) * W;
  const y = (v: number): number => H - pad - ((v - min) / span) * (H - pad * 2);
  const line = d.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  return { line, area };
});
</script>

<template>
  <svg
    v-if="geom"
    :viewBox="`0 0 ${width} ${height}`"
    preserveAspectRatio="none"
    class="h-10 w-full"
    role="img"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="color" stop-opacity="0.35" />
        <stop offset="100%" :stop-color="color" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path :d="geom.area" :fill="`url(#${gradId})`" />
    <path
      :d="geom.line"
      fill="none"
      :stroke="color"
      stroke-width="1.5"
      stroke-linejoin="round"
      stroke-linecap="round"
      vector-effect="non-scaling-stroke"
    />
  </svg>
  <div v-else class="h-10 w-full rounded bg-muted/30" />
</template>
