<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  type AreaData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
} from 'lightweight-charts';
import type { Asset, NavPoint } from '@pnl/types';
import { useTheme } from '@/composables/useTheme';
import { fmtUsd } from '@/lib/format';

const props = defineProps<{ points: NavPoint[] }>();
const { mode } = useTheme();

const container = ref<HTMLDivElement | null>(null);
let chart: IChartApi | null = null;
let total: ISeriesApi<'Area'> | null = null;
let sol: ISeriesApi<'Line'> | null = null;
let sui: ISeriesApi<'Line'> | null = null;
let ro: ResizeObserver | null = null;

const tooltip = reactive({ visible: false, left: 0, top: 0, date: '', value: '' });

// Clickable legend — toggles each series' visibility. The swatch colors follow
// the CSS vars in the DOM; the canvas colors are applied in applyTheme (since
// lightweight-charts renders to canvas and ignores CSS variables).
const legend = reactive([
  { key: 'total', label: 'Total', cssVar: '--nav', visible: true },
  { key: 'sol', label: 'Solana', cssVar: '--solana', visible: true },
  { key: 'sui', label: 'Sui', cssVar: '--sui', visible: true },
]);

function seriesFor(key: string): ISeriesApi<'Area'> | ISeriesApi<'Line'> | null {
  return key === 'total' ? total : key === 'sol' ? sol : sui;
}

function toggle(item: (typeof legend)[number]): void {
  item.visible = !item.visible;
  seriesFor(item.key)?.applyOptions({ visible: item.visible });
}

function timeToDate(t: Time): Date {
  if (typeof t === 'string') return new Date(`${t}T00:00:00`);
  if (typeof t === 'number') return new Date(t * 1000);
  return new Date(Date.UTC(t.year, t.month - 1, t.day));
}

function formatTime(t: Time): string {
  return timeToDate(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Axis tick: include the month name on every day, e.g. "Jan 6".
function formatTick(t: Time): string {
  return timeToDate(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function hexAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function totalData(points: NavPoint[]): AreaData<Time>[] {
  return points.map((p) => ({ time: p.date as Time, value: p.totalValueUsd }));
}

function chainData(points: NavPoint[], asset: Asset): LineData<Time>[] {
  return points.map((p) => ({
    time: p.date as Time,
    value: p.breakdown.find((b) => b.asset === asset)?.valueUsd ?? 0,
  }));
}

// lightweight-charts renders to canvas and does NOT follow CSS variables, so we
// read the theme manually and re-apply on toggle.
function applyTheme(): void {
  if (!chart || !total || !sol || !sui) return;
  const dark = mode.value === 'dark';
  const nav = cssVar('--nav', '#f59e0b');
  const text = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)';
  const grid = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  chart.applyOptions({
    layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: text },
    grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    rightPriceScale: { borderColor: grid },
    timeScale: { borderColor: grid },
  });
  total.applyOptions({
    lineColor: nav,
    topColor: hexAlpha(nav, 0.4),
    bottomColor: hexAlpha(nav, 0.0),
  });
  sol.applyOptions({ color: cssVar('--solana', '#9945ff') });
  sui.applyOptions({ color: cssVar('--sui', '#4da2ff') });
}

onMounted(() => {
  if (!container.value) return;
  chart = createChart(container.value, {
    width: container.value.clientWidth,
    height: 256,
    layout: { attributionLogo: false },
    handleScale: false,
    handleScroll: false,
    rightPriceScale: { scaleMargins: { top: 0.15, bottom: 0.1 } },
    timeScale: { tickMarkFormatter: (t: Time) => formatTick(t) },
    // Magnet snaps the crosshair + marker dot to the nearest data point (anchor).
    crosshair: {
      mode: CrosshairMode.Magnet,
      horzLine: { visible: false },
      vertLine: { labelVisible: false },
    },
  });
  total = chart.addSeries(AreaSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
  sol = chart.addSeries(LineSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
  sui = chart.addSeries(LineSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
  total.setData(totalData(props.points));
  sol.setData(chainData(props.points, 'SOL'));
  sui.setData(chainData(props.points, 'SUI'));
  applyTheme();
  chart.timeScale().fitContent();

  // The container is hidden (v-show → zero width) until data first loads, so the
  // chart is created at width 0. Track its real size ourselves and refit when it
  // becomes visible or resizes — otherwise the full range only renders after a
  // remount (navigating away and back).
  ro = new ResizeObserver((entries) => {
    const w = Math.floor(entries[0]?.contentRect.width ?? 0);
    if (!chart || w <= 0) return;
    chart.applyOptions({ width: w });
    chart.timeScale().fitContent();
  });
  ro.observe(container.value);

  // Tooltip: follows the crosshair (Magnet mode), anchored to the Total series.
  chart.subscribeCrosshairMove((param) => {
    const c = container.value;
    const ch = chart;
    const s = total;
    if (
      !c ||
      !ch ||
      !s ||
      param.time === undefined ||
      !param.point ||
      param.point.x < 0 ||
      param.point.x > c.clientWidth ||
      param.point.y < 0 ||
      param.point.y > c.clientHeight
    ) {
      tooltip.visible = false;
      return;
    }
    const data = param.seriesData.get(s) as { value?: number } | undefined;
    if (data?.value === undefined) {
      tooltip.visible = false;
      return;
    }
    // Anchor the tooltip to the data point's coordinates, then clamp inside the chart.
    const x = Number(ch.timeScale().timeToCoordinate(param.time) ?? param.point.x);
    const y = Number(s.priceToCoordinate(data.value) ?? param.point.y);
    const TW = 128;
    const TH = 52;
    tooltip.left = Math.max(4, Math.min(x - TW / 2, c.clientWidth - TW - 4));
    tooltip.top = y - TH - 10 < 4 ? y + 14 : y - TH - 10;
    tooltip.date = formatTime(param.time);
    tooltip.value = fmtUsd(data.value);
    tooltip.visible = true;
  });
});

watch(
  () => props.points,
  (pts) => {
    total?.setData(totalData(pts));
    sol?.setData(chainData(pts, 'SOL'));
    sui?.setData(chainData(pts, 'SUI'));
    chart?.timeScale().fitContent();
  },
);
watch(mode, applyTheme);

onBeforeUnmount(() => {
  ro?.disconnect();
  ro = null;
  chart?.remove();
  chart = null;
  total = null;
  sol = null;
  sui = null;
});
</script>

<template>
  <div class="w-full">
    <div v-show="points.length > 0" class="mb-2 flex flex-wrap items-center gap-2 text-xs">
      <button
        v-for="item in legend"
        :key="item.key"
        type="button"
        class="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-opacity hover:bg-accent"
        :class="item.visible ? '' : 'opacity-40'"
        @click="toggle(item)"
      >
        <span class="size-2.5 rounded-full" :style="{ backgroundColor: `var(${item.cssVar})` }" />
        <span :class="item.visible ? '' : 'line-through'">{{ item.label }}</span>
      </button>
    </div>
    <div class="h-64 w-full">
      <div v-show="points.length > 0" ref="container" class="relative h-full w-full">
        <div
          v-show="tooltip.visible"
          class="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-border/60 bg-popover/95 px-2.5 py-1.5 text-xs shadow-md backdrop-blur"
          :style="{ left: `${tooltip.left}px`, top: `${tooltip.top}px` }"
        >
          <div class="text-muted-foreground">{{ tooltip.date }}</div>
          <div class="font-semibold tabular-nums text-foreground">{{ tooltip.value }}</div>
        </div>
      </div>
      <div v-if="points.length === 0" class="grid h-full place-items-center text-sm text-muted-foreground">
        No history yet — add some orders.
      </div>
    </div>
  </div>
</template>
