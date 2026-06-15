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
import type { Chain, Holding, NavPoint } from '@pnl/types';
import { useTheme } from '@/composables/useTheme';
import { chainColor, extractTokenColor } from '@/composables/useTokenColor';
import { knownTokenColor, knownTokenLogo } from '@/lib/tokenLogos';
import { fmtUsd } from '@/lib/format';

const props = defineProps<{ points: NavPoint[]; holdings: Holding[] }>();
const { mode } = useTheme();

// How many holdings are shown by default; the rest are added but hidden and can
// be toggled on via the legend.
const TOP_N = 5;

const container = ref<HTMLDivElement | null>(null);
let chart: IChartApi | null = null;
let total: ISeriesApi<'Area'> | null = null;
// Per-holding line series, keyed by `${chain}:${asset}`.
const lineSeries = new Map<string, ISeriesApi<'Line'>>();
const seriesColor = new Map<string, string>();
// Explicit user toggles survive data refreshes (otherwise top-N would reset).
const visibilityOverride = new Map<string, boolean>();
let ro: ResizeObserver | null = null;

const tooltip = reactive({ visible: false, left: 0, top: 0, date: '', value: '' });

interface LegendItem {
  key: string;
  label: string;
  color: string;
  visible: boolean;
}
const legend = ref<LegendItem[]>([]);

function isVisible(key: string, fallback: boolean): boolean {
  const o = visibilityOverride.get(key);
  return o === undefined ? fallback : o;
}

function toggle(item: LegendItem): void {
  const next = !item.visible;
  item.visible = next;
  visibilityOverride.set(item.key, next);
  if (item.key === 'total') total?.applyOptions({ visible: next });
  else lineSeries.get(item.key)?.applyOptions({ visible: next });
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

// Per-holding series. NOTE: `breakdown` keys by (chain, asset) symbol — NOT
// address — so two distinct mints sharing a ticker collapse into one summed
// line here (the address-keyed HoldingsTable stays exact). Summing mirrors the
// chain-aggregation pattern this chart used before.
function lineData(points: NavPoint[], chain: Chain, asset: string): LineData<Time>[] {
  return points.map((p) => ({
    time: p.date as Time,
    value: p.breakdown
      .filter((b) => b.chain === chain && b.asset === asset)
      .reduce((s, b) => s + b.valueUsd, 0),
  }));
}

interface AggToken {
  key: string;
  chain: Chain;
  asset: string;
  value: number;
  image?: string;
}

// Currently-held tokens, deduped by (chain, asset) and sorted by value desc.
function aggregate(holdings: Holding[]): AggToken[] {
  const byKey = new Map<string, AggToken>();
  for (const h of holdings) {
    if (h.valueUsd <= 0) continue; // closed positions don't get a chart line
    const key = `${h.chain}:${h.asset}`;
    const cur = byKey.get(key);
    if (cur) cur.value += h.valueUsd;
    else
      byKey.set(key, {
        key,
        chain: h.chain,
        asset: h.asset,
        value: h.valueUsd,
        image: h.image || knownTokenLogo(h.asset),
      });
  }
  return [...byKey.values()].sort((a, b) => b.value - a.value);
}

// Incrementally reconcile the per-holding line series with the current holdings
// + points, preserving existing series (and crosshair state) across refreshes.
function syncSeries(): void {
  if (!chart || !total) return;
  total.setData(totalData(props.points));
  total.applyOptions({ visible: isVisible('total', true) });

  const agg = aggregate(props.holdings);
  const nextKeys = new Set(agg.map((t) => t.key));

  for (const [key, s] of lineSeries) {
    if (!nextKeys.has(key)) {
      chart.removeSeries(s);
      lineSeries.delete(key);
      seriesColor.delete(key);
    }
  }

  const items: LegendItem[] = [
    { key: 'total', label: 'Total', color: cssVar('--nav', '#f59e0b'), visible: isVisible('total', true) },
  ];

  agg.forEach((t, i) => {
    const visible = isVisible(t.key, i < TOP_N);
    let s = lineSeries.get(t.key);
    if (!s) {
      const known = knownTokenColor(t.asset);
      const color = known ?? chainColor(t.chain);
      s = chart!.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        visible,
      });
      lineSeries.set(t.key, s);
      seriesColor.set(t.key, color);
      // Upgrade to the logo's dominant color when it resolves (unless a fixed
      // brand color applies, e.g. USDC). Chain color shows until then.
      if (!known && t.image) {
        extractTokenColor(t.image)
          .then((hex) => {
            seriesColor.set(t.key, hex);
            lineSeries.get(t.key)?.applyOptions({ color: hex });
            const li = legend.value.find((l) => l.key === t.key);
            if (li) li.color = hex;
          })
          .catch(() => {
            /* keep chain color */
          });
      }
    } else {
      s.applyOptions({ visible });
    }
    s.setData(lineData(props.points, t.chain, t.asset));
    items.push({ key: t.key, label: t.asset, color: seriesColor.get(t.key) ?? chainColor(t.chain), visible });
  });

  legend.value = items;
}

// lightweight-charts renders to canvas and does NOT follow CSS variables, so we
// read the theme manually and re-apply on toggle. Per-holding line colors are
// brand colors (theme-independent), so only the total/grid need re-theming.
function applyTheme(): void {
  if (!chart || !total) return;
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
  total.applyOptions({ lineColor: nav, topColor: hexAlpha(nav, 0.4), bottomColor: hexAlpha(nav, 0.0) });
  const li = legend.value.find((l) => l.key === 'total');
  if (li) li.color = nav;
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
  syncSeries();
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

watch([() => props.points, () => props.holdings], syncSeries);
watch(mode, applyTheme);

onBeforeUnmount(() => {
  ro?.disconnect();
  ro = null;
  chart?.remove();
  chart = null;
  total = null;
  lineSeries.clear();
  seriesColor.clear();
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
        <span class="size-2.5 rounded-full" :style="{ backgroundColor: item.color }" />
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
