<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';
import { Check, Loader2, Search } from '@lucide/vue';
import type { Asset, Chain, OrderSide, ParsedOrderPreview, WalletDTO } from '@pnl/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ChainToggle from '@/components/ChainToggle.vue';
import TokenIcon from '@/components/icons/TokenIcon.vue';
import { cn } from '@/lib/utils';
import { fmtDate, fmtNum, fmtUsd, nowLocalDatetime } from '@/lib/format';
import { useOrders } from '@/stores/useOrders';
import { useWallets } from '@/stores/useWallets';
import { useTxImport } from '@/composables/useTxImport';

const emit = defineEmits<{ created: [] }>();

const open = ref(false);
const tx = useTxImport();
const wallets = useWallets();

// Sentinel option that reveals a free-text input for scanning any address.
const OTHER = '__other__';

// --- Manual ---
const asset = ref<Asset>('SOL');
const side = ref<OrderSide>('buy');
const amount = ref('');
const price = ref('');
const fee = ref('0');
const date = ref(nowLocalDatetime());
const submitting = ref(false);
const total = computed(() => {
  const a = parseFloat(amount.value);
  const p = parseFloat(price.value);
  return Number.isFinite(a) && Number.isFinite(p) ? a * p : 0;
});

// --- Scan / Link shared chain ---
const chainTx = ref<Chain>('sol');

// Your wallets for the chosen chain (drives the scan/link selects).
const chainWallets = computed<WalletDTO[]>(() => wallets.byChain(chainTx.value));

function walletLabel(w: WalletDTO): string {
  const short = `${w.address.slice(0, 6)}…${w.address.slice(-6)}`;
  return w.label ? `${w.label} (${short})` : short;
}

// --- Scan ---
const candidates = ref<ParsedOrderPreview[]>([]);
const selected = ref<string[]>([]);
const scanned = ref(false);
// scanSelection is a wallet address or OTHER; scanOther holds the free-text address.
const scanSelection = ref<string>('');
const scanOther = ref('');
const scanAddress = computed(() =>
  scanSelection.value === OTHER ? scanOther.value.trim() : scanSelection.value,
);

// --- Link ---
const linkInput = ref('');
// linkSelection: '' = use the tx signer (default), a wallet address, or OTHER.
const linkSelection = ref<string>('');
const linkOther = ref('');
const linkAddress = computed(() =>
  linkSelection.value === OTHER ? linkOther.value.trim() : linkSelection.value,
);
const preview = ref<ParsedOrderPreview | null>(null);

// Keep the scan selection valid as wallets load or the chain changes: default
// to the first wallet for the chain, or the "Other address" escape hatch.
watch(
  [chainWallets, open],
  () => {
    if (!open.value) return;
    const valid =
      scanSelection.value === OTHER ||
      chainWallets.value.some((w) => w.address === scanSelection.value);
    if (!valid) scanSelection.value = chainWallets.value[0]?.address ?? OTHER;
  },
  { immediate: true },
);

// Switching chains clears the (optional) link address selection.
watch(chainTx, () => {
  linkSelection.value = '';
  linkOther.value = '';
  scanOther.value = '';
});

function resetAll(): void {
  asset.value = 'SOL';
  side.value = 'buy';
  amount.value = '';
  price.value = '';
  fee.value = '0';
  date.value = nowLocalDatetime();
  candidates.value = [];
  selected.value = [];
  scanned.value = false;
  scanSelection.value = chainWallets.value[0]?.address ?? OTHER;
  scanOther.value = '';
  linkInput.value = '';
  linkSelection.value = '';
  linkOther.value = '';
  preview.value = null;
}

watch(open, (isOpen) => {
  if (isOpen) void wallets.fetchWallets();
  else resetAll();
});

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

// --- Manual submit ---
async function submitManual(): Promise<void> {
  const a = parseFloat(amount.value);
  const p = parseFloat(price.value);
  const f = parseFloat(fee.value || '0');
  if (!(a > 0)) return void toast.error('Enter an amount greater than 0');
  if (!(p >= 0)) return void toast.error('Enter a valid USD price');

  submitting.value = true;
  try {
    await useOrders().addOrder({
      chain: asset.value === 'SOL' ? 'sol' : 'sui',
      asset: asset.value,
      side: side.value,
      amount: a,
      priceUsd: p,
      feeUsd: Number.isFinite(f) ? f : 0,
      gasUsd: 0,
      timestamp: new Date(date.value).toISOString(),
    });
    toast.success('Order added');
    emit('created');
    open.value = false;
  } catch (e) {
    toast.error(errMsg(e, 'Failed to add order'));
  } finally {
    submitting.value = false;
  }
}

// --- Scan ---
async function runScan(): Promise<void> {
  try {
    candidates.value = await tx.scan(chainTx.value, scanAddress.value);
    selected.value = candidates.value.map((c) => c.txSignature);
    scanned.value = true;
    if (candidates.value.length === 0) toast.info('No swaps found in recent history');
  } catch (e) {
    toast.error(errMsg(e, 'Scan failed'));
  }
}

function toggleSelect(sig: string): void {
  selected.value = selected.value.includes(sig)
    ? selected.value.filter((s) => s !== sig)
    : [...selected.value, sig];
}

async function importSelected(): Promise<void> {
  const chosen = candidates.value.filter((c) => selected.value.includes(c.txSignature));
  if (chosen.length === 0) return void toast.error('Select at least one transaction');
  let imported = 0;
  for (const c of chosen) {
    try {
      await tx.importCandidate(chainTx.value, c);
      imported += 1;
    } catch {
      /* skip failures, report count below */
    }
  }
  toast.success(`Imported ${imported} of ${chosen.length}`);
  emit('created');
  open.value = false;
}

// --- Link ---
async function runPreview(): Promise<void> {
  if (!linkInput.value.trim()) return void toast.error('Paste a transaction link or signature');
  try {
    preview.value = await tx.parse(chainTx.value, linkInput.value.trim(), linkAddress.value);
  } catch (e) {
    preview.value = null;
    toast.error(errMsg(e, 'Could not parse that transaction'));
  }
}

async function importLink(): Promise<void> {
  try {
    await tx.importLink(chainTx.value, linkInput.value.trim(), linkAddress.value);
    toast.success('Order imported');
    emit('created');
    open.value = false;
  } catch (e) {
    toast.error(errMsg(e, 'Import failed'));
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
        <DialogTitle>Add order</DialogTitle>
        <DialogDescription>Scan your wallet, paste a tx link, or enter manually.</DialogDescription>
      </DialogHeader>

      <Tabs default-value="manual" class="w-full">
        <TabsList class="grid w-full grid-cols-3">
          <TabsTrigger value="manual">Manual</TabsTrigger>
          <TabsTrigger value="scan">Scan</TabsTrigger>
          <TabsTrigger value="link">Tx link</TabsTrigger>
        </TabsList>

        <!-- Manual -->
        <TabsContent value="manual" class="space-y-4 pt-2">
          <div class="space-y-2">
            <Label>Asset</Label>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                :class="cn('flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors', asset === 'SOL' ? 'border-solana bg-solana/10 text-solana' : 'border-border text-muted-foreground hover:bg-accent')"
                @click="asset = 'SOL'"
              >
                <TokenIcon asset="SOL" class="size-4" /> SOL
              </button>
              <button
                type="button"
                :class="cn('flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors', asset === 'SUI' ? 'border-sui bg-sui/10 text-sui' : 'border-border text-muted-foreground hover:bg-accent')"
                @click="asset = 'SUI'"
              >
                <TokenIcon asset="SUI" class="size-4" /> SUI
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <Label>Side</Label>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                :class="cn('rounded-md border px-3 py-2 text-sm font-medium transition-colors', side === 'buy' ? 'border-profit bg-profit/10 text-profit' : 'border-border text-muted-foreground hover:bg-accent')"
                @click="side = 'buy'"
              >Buy</button>
              <button
                type="button"
                :class="cn('rounded-md border px-3 py-2 text-sm font-medium transition-colors', side === 'sell' ? 'border-loss bg-loss/10 text-loss' : 'border-border text-muted-foreground hover:bg-accent')"
                @click="side = 'sell'"
              >Sell</button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-2">
              <Label for="amount">Amount ({{ asset }})</Label>
              <Input id="amount" v-model="amount" type="number" min="0" step="any" placeholder="0.00" />
            </div>
            <div class="space-y-2">
              <Label for="price">Price (USD)</Label>
              <Input id="price" v-model="price" type="number" min="0" step="any" placeholder="0.00" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-2">
              <Label for="date">Date</Label>
              <Input id="date" v-model="date" type="datetime-local" />
            </div>
            <div class="space-y-2">
              <Label for="fee">Fee (USD)</Label>
              <Input id="fee" v-model="fee" type="number" min="0" step="any" />
            </div>
          </div>

          <div class="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span class="text-muted-foreground">Total</span>
            <span class="font-medium">{{ fmtUsd(total) }}</span>
          </div>

          <Button class="w-full" :disabled="submitting" @click="submitManual">
            {{ submitting ? 'Adding…' : 'Add order' }}
          </Button>
        </TabsContent>

        <!-- Scan -->
        <TabsContent value="scan" class="space-y-4 pt-2">
          <ChainToggle v-model="chainTx" />
          <div class="space-y-2">
            <Label for="scanAddr">Wallet to scan</Label>
            <select
              id="scanAddr"
              v-model="scanSelection"
              class="h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option v-for="w in chainWallets" :key="w.id" :value="w.address">{{ walletLabel(w) }}</option>
              <option :value="OTHER">Other address…</option>
            </select>
            <Input
              v-if="scanSelection === OTHER"
              v-model="scanOther"
              class="font-mono text-xs"
              :placeholder="chainTx === 'sol' ? 'Solana wallet address' : 'Sui wallet address'"
            />
            <p v-if="chainWallets.length === 0" class="text-xs text-muted-foreground">
              No {{ chainTx === 'sol' ? 'Solana' : 'Sui' }} wallets yet — add one in
              <RouterLink to="/settings" class="underline hover:text-foreground">Settings</RouterLink>, or scan any address.
            </p>
            <p v-else class="text-xs text-muted-foreground">
              Pick one of your wallets, or “Other address” to scan any wallet.
            </p>
          </div>
          <Button variant="outline" class="w-full gap-2" :disabled="tx.scanning.value || !scanAddress" @click="runScan">
            <Loader2 v-if="tx.scanning.value" class="size-4 animate-spin" />
            <Search v-else class="size-4" />
            Scan recent swaps
          </Button>

          <div v-if="candidates.length" class="max-h-64 space-y-2 overflow-y-auto">
            <button
              v-for="c in candidates"
              :key="c.txSignature"
              type="button"
              :class="cn(
                'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors',
                selected.includes(c.txSignature) ? 'border-primary bg-accent' : 'border-border hover:bg-accent/50',
              )"
              @click="toggleSelect(c.txSignature)"
            >
              <span class="flex items-center gap-2">
                <span class="grid size-4 place-items-center rounded-sm border" :class="selected.includes(c.txSignature) ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'">
                  <Check v-if="selected.includes(c.txSignature)" class="size-3" />
                </span>
                <span :class="c.side === 'buy' ? 'text-profit' : 'text-loss'" class="font-medium capitalize">{{ c.side }}</span>
                {{ fmtNum(c.amount) }} {{ c.asset }}
              </span>
              <span class="text-xs text-muted-foreground">{{ fmtUsd(c.priceUsd, 2) }}</span>
            </button>
          </div>
          <p v-else-if="scanned && !tx.scanning.value" class="py-4 text-center text-sm text-muted-foreground">
            No swaps found.
          </p>

          <Button
            v-if="candidates.length"
            class="w-full"
            :disabled="tx.importing.value || selected.length === 0"
            @click="importSelected"
          >
            {{ tx.importing.value ? 'Importing…' : `Import ${selected.length} selected` }}
          </Button>
        </TabsContent>

        <!-- Tx link -->
        <TabsContent value="link" class="space-y-4 pt-2">
          <ChainToggle v-model="chainTx" />
          <div class="space-y-2">
            <Label for="link">Transaction link or signature</Label>
            <Input id="link" v-model="linkInput" :placeholder="chainTx === 'sol' ? 'solscan.io/tx/… or signature' : 'suivision.xyz/txblock/… or digest'" />
          </div>
          <div class="space-y-2">
            <Label for="linkAddr">Wallet address <span class="font-normal text-muted-foreground">(optional)</span></Label>
            <select
              id="linkAddr"
              v-model="linkSelection"
              class="h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Use transaction signer</option>
              <option v-for="w in chainWallets" :key="w.id" :value="w.address">{{ walletLabel(w) }}</option>
              <option :value="OTHER">Other address…</option>
            </select>
            <Input
              v-if="linkSelection === OTHER"
              v-model="linkOther"
              class="font-mono text-xs"
              placeholder="Wallet address"
            />
          </div>
          <Button variant="outline" class="w-full gap-2" :disabled="tx.parsing.value" @click="runPreview">
            <Loader2 v-if="tx.parsing.value" class="size-4 animate-spin" />
            Preview
          </Button>

          <div v-if="preview" class="space-y-1 rounded-md border p-3 text-sm">
            <div class="flex justify-between">
              <span class="text-muted-foreground">Trade</span>
              <span><span :class="preview.side === 'buy' ? 'text-profit' : 'text-loss'" class="font-medium capitalize">{{ preview.side }}</span> {{ fmtNum(preview.amount) }} {{ preview.asset }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Price</span><span>{{ fmtUsd(preview.priceUsd, 2) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Date</span><span>{{ fmtDate(preview.timestamp) }}</span>
            </div>
          </div>

          <Button v-if="preview" class="w-full" :disabled="tx.importing.value" @click="importLink">
            {{ tx.importing.value ? 'Importing…' : 'Import order' }}
          </Button>
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
</template>
