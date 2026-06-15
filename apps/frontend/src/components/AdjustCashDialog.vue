<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import { Trash2 } from '@lucide/vue';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCash } from '@/stores/useCash';
import { usePortfolio } from '@/stores/usePortfolio';
import { fmtDate, fmtSignedUsd, fmtUsd } from '@/lib/format';

const props = defineProps<{ currentBalance?: number }>();

const open = ref(false);
const amount = ref('');
const note = ref('');
const submitting = ref(false);

const { adjustments, fetchAdjustments, addAdjustment, removeAdjustment } = useCash();

watch(open, (isOpen) => {
  if (isOpen) {
    amount.value = '';
    note.value = '';
    void fetchAdjustments();
  }
});

const projected = computed(() => {
  const a = parseFloat(amount.value);
  return (props.currentBalance ?? 0) + (Number.isFinite(a) ? a : 0);
});

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

async function apply(): Promise<void> {
  const a = parseFloat(amount.value);
  if (!Number.isFinite(a) || a === 0) return void toast.error('Enter a non-zero amount');
  submitting.value = true;
  try {
    await addAdjustment({ amount: a, note: note.value.trim() || undefined });
    await usePortfolio().fetchAll();
    amount.value = '';
    note.value = '';
    toast.success('Balance adjusted');
  } catch (e) {
    toast.error(errMsg(e, 'Failed to adjust balance'));
  } finally {
    submitting.value = false;
  }
}

async function remove(id: string): Promise<void> {
  try {
    await removeAdjustment(id);
    await usePortfolio().fetchAll();
  } catch (e) {
    toast.error(errMsg(e, 'Failed to remove adjustment'));
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child>
      <slot />
    </DialogTrigger>
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Adjust USDC balance</DialogTitle>
        <DialogDescription>
          Log a deposit (+) or withdrawal (−) that isn’t a trade. Adjustments accumulate on top of
          the trade-derived balance.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-3">
        <div class="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
          <span class="text-muted-foreground">Current balance</span>
          <span class="font-medium tabular-nums">{{ fmtUsd(currentBalance ?? 0) }}</span>
        </div>

        <div class="space-y-2">
          <Label for="adjAmount">Amount (USD)</Label>
          <Input
            id="adjAmount"
            v-model="amount"
            type="number"
            step="any"
            placeholder="-252 to withdraw, 500 to deposit"
          />
        </div>

        <div class="space-y-2">
          <Label for="adjNote">Note <span class="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="adjNote" v-model="note" placeholder="e.g. moved to bank" />
        </div>

        <div
          v-if="amount && projected !== (currentBalance ?? 0)"
          class="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
        >
          <span class="text-muted-foreground">New balance</span>
          <span class="font-medium tabular-nums">{{ fmtUsd(projected) }}</span>
        </div>

        <Button class="w-full" :disabled="submitting" @click="apply">
          {{ submitting ? 'Applying…' : 'Apply adjustment' }}
        </Button>
      </div>

      <div v-if="adjustments.length" class="mt-1 space-y-1 border-t pt-3">
        <p class="text-xs font-medium text-muted-foreground">History</p>
        <div
          v-for="adj in adjustments"
          :key="adj.id"
          class="flex items-center gap-2 text-sm"
        >
          <span :class="adj.amount >= 0 ? 'text-profit' : 'text-loss'" class="tabular-nums">
            {{ fmtSignedUsd(adj.amount) }}
          </span>
          <span class="min-w-0 truncate text-xs text-muted-foreground">
            {{ adj.note || fmtDate(adj.timestamp) }}
          </span>
          <Button variant="ghost" size="icon" class="ml-auto size-7" aria-label="Remove adjustment" @click="remove(adj.id)">
            <Trash2 class="size-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
