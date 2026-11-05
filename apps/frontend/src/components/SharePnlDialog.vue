<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Download, Share2 } from '@lucide/vue';
import { toast } from 'vue-sonner';
import type { PnlRange, PnlSummary } from '@pnl/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  SHARE_STYLES,
  canvasToBlob,
  renderShareImage,
  shareFileName,
  type ShareData,
  type ShareStyle,
} from '@/lib/shareImage';
import { usePortfolio } from '@/stores/usePortfolio';

const { pnlRange } = usePortfolio();

const RANGES: { value: PnlRange; label: string }[] = [
  { value: '24h', label: '24H' },
  { value: '30d', label: '30D' },
  { value: 'lifetime', label: 'Lifetime' },
];

const open = ref(false);
const range = ref<PnlRange>(pnlRange.value);
const style = ref<ShareStyle>('beams');
// Per-range summaries fetched while the dialog is open; independent of the
// dashboard card so switching here doesn't change the dashboard's range.
const summaries = ref<Partial<Record<PnlRange, PnlSummary>>>({});
const previews = ref<Partial<Record<ShareStyle, string>>>({});
const loading = ref(false);
const busy = ref(false);

const data = computed<ShareData | null>(() => {
  const s = summaries.value[range.value];
  return s ? { roi: s.roi, total: s.total, range: range.value } : null;
});

const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';

async function loadRange(r: PnlRange): Promise<void> {
  if (summaries.value[r]) return;
  loading.value = true;
  try {
    const s = await api.get<PnlSummary>(`/pnl/summary?range=${r}`);
    summaries.value = { ...summaries.value, [r]: s };
  } catch {
    toast.error('Could not load PnL for this range');
  } finally {
    loading.value = false;
  }
}

// Render a preview of every style so they can be compared side by side.
let renderSeq = 0;
async function renderPreviews(): Promise<void> {
  const d = data.value;
  if (!d) return;
  const seq = ++renderSeq;
  const entries = await Promise.all(
    SHARE_STYLES.map(async (s) => [s.value, (await renderShareImage(d, s.value)).toDataURL('image/png')] as const),
  );
  if (seq === renderSeq) previews.value = Object.fromEntries(entries);
}

watch(open, (isOpen) => {
  if (!isOpen) return;
  // Start on the dashboard card's range, but always fetch fresh: the card's
  // summary can still belong to the previous range while its fetch is in flight.
  summaries.value = {};
  previews.value = {};
  if (range.value === pnlRange.value) void loadRange(range.value);
  else range.value = pnlRange.value; // the range watcher fetches it
});

watch(range, (r) => void loadRange(r));
watch(data, () => void renderPreviews());

async function currentFile(): Promise<File> {
  const d = data.value!;
  const blob = await canvasToBlob(await renderShareImage(d, style.value));
  return new File([blob], shareFileName(d, style.value), { type: 'image/png' });
}

async function download(): Promise<void> {
  if (!data.value) return;
  busy.value = true;
  try {
    const file = await currentFile();
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    toast.error('Could not create image');
  } finally {
    busy.value = false;
  }
}

async function share(): Promise<void> {
  if (!data.value) return;
  busy.value = true;
  try {
    const file = await currentFile();
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
    } else {
      toast.error('Sharing images is not supported on this device — use Download instead');
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') toast.error('Could not share image');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child>
      <slot />
    </DialogTrigger>
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>Share PnL</DialogTitle>
        <DialogDescription>Create a 1080×1080 image for Instagram.</DialogDescription>
      </DialogHeader>

      <div class="grid gap-5 sm:grid-cols-[minmax(0,1fr)_13rem]">
        <!-- Large preview of the selected style -->
        <div class="relative aspect-square w-full overflow-hidden rounded-lg border bg-muted/40">
          <img
            v-if="previews[style]"
            :src="previews[style]"
            alt="PnL share image preview"
            :class="cn('size-full object-cover transition-opacity', loading && 'opacity-50')"
          />
          <div v-else class="flex size-full items-center justify-center text-sm text-muted-foreground">
            {{ loading ? 'Loading…' : 'No PnL data yet' }}
          </div>
        </div>

        <div class="flex flex-col gap-4">
          <div class="space-y-2">
            <p class="text-xs font-medium text-muted-foreground">Range</p>
            <div class="flex w-fit items-center gap-0.5 rounded-full border bg-muted/50 p-0.5">
              <button
                v-for="r in RANGES"
                :key="r.value"
                type="button"
                :class="cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  range === r.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )"
                @click="range = r.value"
              >
                {{ r.label }}
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <p class="text-xs font-medium text-muted-foreground">Style</p>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="s in SHARE_STYLES"
                :key="s.value"
                type="button"
                class="group space-y-1 text-left outline-none"
                :aria-pressed="style === s.value"
                @click="style = s.value"
              >
                <div
                  :class="cn(
                    'aspect-square overflow-hidden rounded-md border-2 bg-muted/40 transition-colors group-focus-visible:border-ring',
                    style === s.value ? 'border-primary' : 'border-transparent group-hover:border-border',
                  )"
                >
                  <img v-if="previews[s.value]" :src="previews[s.value]" :alt="`${s.label} style`" class="size-full" />
                </div>
                <span
                  :class="cn('block text-center text-xs font-medium', style === s.value ? 'text-foreground' : 'text-muted-foreground')"
                >
                  {{ s.label }}
                </span>
              </button>
            </div>
          </div>

          <div class="mt-auto flex flex-col gap-2">
            <Button :disabled="!data || busy" @click="download">
              <Download class="size-4" /> Download PNG
            </Button>
            <Button v-if="canNativeShare" variant="outline" :disabled="!data || busy" @click="share">
              <Share2 class="size-4" /> Share
            </Button>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
