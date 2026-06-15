<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { toast } from 'vue-sonner';
import { Check, Loader2, Search } from '@lucide/vue';
import {
  nativeTokenAddress,
  type Chain,
  type Order,
  type OrderSide,
  type OwnedAsset,
  type ParsedOrderPreview,
  type TokenMeta,
  type WalletDTO,
} from '@pnl/types';
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
import { fmtDate, fmtNum, fmtUsd, isoToLocalDatetime, nowLocalDatetime } from '@/lib/format';
import { useOrders } from '@/stores/useOrders';
import { useWallets } from '@/stores/useWallets';
import { useTxImport } from '@/composables/useTxImport';

const props = defineProps<{ editOrder?: Order | null }>();
const emit = defineEmits<{ created: []; updated: [] }>();

// `open` is a model so the dialog can be either self-triggered (Add) or
// controlled by a parent (Edit, opened from a table row).
const open = defineModel<boolean>('open', { default: false });
const editMode = computed(() => !!props.editOrder);
const tx = useTxImport();
const wallets = useWallets();

// Sentinel option that reveals a free-text input for scanning any address.
const OTHER = '__other__';

/** Canonical native token for a chain (the Manual tab's default token). */
function nativeMeta(chain: Chain): TokenMeta {
  return {
    chain,
    address: nativeTokenAddress(chain),
    symbol: chain === 'sol' ? 'SOL' : 'SUI',
    name: chain === 'sol' ? 'Solana' : 'Sui',
    decimals: 9,
  };
}

// --- Manual ---
const chainManual = ref<Chain>('sol');
const manualToken = ref<TokenMeta | null>(null); // null → use the chain's native coin
const tokenAddrInput = ref('');
const side = ref<OrderSide>('buy');
const amount = ref('');
const price = ref('');
const fee = ref('0');
const date = ref(nowLocalDatetime());
const submitting = ref(false);
const manualTokenEffective = computed(() => manualToken.value ?? nativeMeta(chainManual.value));
const total = computed(() => {
  const a = parseFloat(amount.value);
  const p = parseFloat(price.value);
  return Number.isFinite(a) && Number.isFinite(p) ? a * p : 0;
});

// --- Scan / Swaps / Link shared chain ---
const chainTx = ref<Chain>('sol');

// Your wallets for the chosen chain (drives the swaps/link selects).
const chainWallets = computed<WalletDTO[]>(() => wallets.byChain(chainTx.value));

function walletLabel(w: WalletDTO): string {
  const short = `${w.address.slice(0, 6)}…${w.address.slice(-6)}`;
  return w.label ? `${w.label} (${short})` : short;
}

// --- Scan assets (fetch held tokens, pre-fill an order) ---
const ownedAssets = ref<OwnedAsset[]>([]);
const assetsFetched = ref(false);
const selectedAsset = ref<OwnedAsset | null>(null);
const assetSide = ref<OrderSide>('buy');
const assetAmount = ref('');
const assetPrice = ref('');
const assetDate = ref(nowLocalDatetime());
const assetFee = ref('0');

// --- Swaps (recent swap transactions) ---
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

// Keep the swap-scan selection valid as wallets load or the chain changes: default
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

// Switching the shared chain clears chain-specific selections + scanned results.
watch(chainTx, () => {
  linkSelection.value = '';
  linkOther.value = '';
  scanOther.value = '';
  ownedAssets.value = [];
  assetsFetched.value = false;
  selectedAsset.value = null;
});

// Switching the Manual chain resets the token back to native.
watch(chainManual, () => {
  manualToken.value = null;
  tokenAddrInput.value = '';
});

function resetAll(): void {
  chainManual.value = 'sol';
  manualToken.value = null;
  tokenAddrInput.value = '';
  side.value = 'buy';
  amount.value = '';
  price.value = '';
  fee.value = '0';
  date.value = nowLocalDatetime();
  ownedAssets.value = [];
  assetsFetched.value = false;
  selectedAsset.value = null;
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

// Pre-fill the Manual form from an existing order (edit mode). nextTick lets the
// chainManual watcher (which clears the token) run first, so it doesn't wipe our token.
async function prefillFromOrder(o: Order): Promise<void> {
  chainManual.value = o.chain;
  await nextTick();
  manualToken.value = {
    chain: o.chain,
    address: o.address,
    symbol: o.asset,
    name: o.name,
    image: o.image,
    decimals: o.decimals,
  };
  tokenAddrInput.value = '';
  side.value = o.side;
  amount.value = String(o.amount);
  price.value = String(o.priceUsd);
  fee.value = String(o.feeUsd ?? 0);
  date.value = isoToLocalDatetime(o.timestamp);
}

watch(
  open,
  (isOpen) => {
    if (isOpen) {
      if (props.editOrder) void prefillFromOrder(props.editOrder);
      else void wallets.fetchWallets();
    } else {
      resetAll();
    }
  },
  { immediate: true },
);

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

// --- Manual ---
function resetManualToken(): void {
  manualToken.value = null;
  tokenAddrInput.value = '';
}

async function lookupManualToken(): Promise<void> {
  const addr = tokenAddrInput.value.trim();
  if (!addr) return;
  try {
    const res = await tx.lookupToken(chainManual.value, addr);
    manualToken.value = res.token;
    if (res.priceUsd != null && res.priceUsd > 0) price.value = String(res.priceUsd);
  } catch (e) {
    toast.error(errMsg(e, 'Token not found'));
  }
}

async function submitManual(): Promise<void> {
  const a = parseFloat(amount.value);
  const p = parseFloat(price.value);
  const f = parseFloat(fee.value || '0');
  if (!(a > 0)) return void toast.error('Enter an amount greater than 0');
  if (!(p >= 0)) return void toast.error('Enter a valid USD price');

  const t = manualTokenEffective.value;
  const input = {
    chain: t.chain,
    address: t.address,
    asset: t.symbol,
    decimals: t.decimals,
    name: t.name,
    image: t.image,
    side: side.value,
    amount: a,
    priceUsd: p,
    feeUsd: Number.isFinite(f) ? f : 0,
    gasUsd: 0,
    timestamp: new Date(date.value).toISOString(),
  };
  submitting.value = true;
  try {
    if (props.editOrder) {
      await useOrders().updateOrder(props.editOrder.id, input);
      toast.success('Order updated');
      emit('updated');
    } else {
      await useOrders().addOrder(input);
      toast.success('Order added');
      emit('created');
    }
    open.value = false;
  } catch (e) {
    toast.error(errMsg(e, props.editOrder ? 'Failed to update order' : 'Failed to add order'));
  } finally {
    submitting.value = false;
  }
}

// --- Scan assets ---
async function runFetchAssets(): Promise<void> {
  try {
    ownedAssets.value = await tx.fetchAssets(chainTx.value);
    assetsFetched.value = true;
    selectedAsset.value = null;
    if (ownedAssets.value.length === 0) toast.info('No tokens found in your wallets');
  } catch (e) {
    toast.error(errMsg(e, 'Could not fetch your tokens'));
  }
}

function selectAsset(a: OwnedAsset): void {
  selectedAsset.value = a;
  assetSide.value = 'buy';
  assetAmount.value = a.balance ? String(a.balance) : '';
  assetPrice.value = a.priceUsd != null ? String(a.priceUsd) : '';
  assetDate.value = nowLocalDatetime();
  assetFee.value = '0';
}

async function submitAsset(): Promise<void> {
  const a = selectedAsset.value;
  if (!a) return;
  const amt = parseFloat(assetAmount.value);
  const p = parseFloat(assetPrice.value);
  const f = parseFloat(assetFee.value || '0');
  if (!(amt > 0)) return void toast.error('Enter an amount greater than 0');
  if (!(p >= 0)) return void toast.error('Enter a valid USD price');

  submitting.value = true;
  try {
    await useOrders().addOrder({
      chain: a.chain,
      address: a.address,
      asset: a.symbol,
      decimals: a.decimals,
      name: a.name,
      image: a.image,
      side: assetSide.value,
      amount: amt,
      priceUsd: p,
      feeUsd: Number.isFinite(f) ? f : 0,
      gasUsd: 0,
      timestamp: new Date(assetDate.value).toISOString(),
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

// --- Swaps ---
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
        <DialogTitle>{{ editMode ? 'Edit order' : 'Add order' }}</DialogTitle>
        <DialogDescription>
          {{
            editMode
              ? 'Update this order’s details.'
              : 'Scan the tokens you hold, add one by address, or import on-chain trades.'
          }}
        </DialogDescription>
      </DialogHeader>

      <Tabs :default-value="editMode ? 'manual' : 'scan'" class="w-full">
        <TabsList v-if="!editMode" class="grid w-full grid-cols-4">
          <TabsTrigger value="scan">Scan</TabsTrigger>
          <TabsTrigger value="manual">Manual</TabsTrigger>
          <TabsTrigger value="swaps">Swaps</TabsTrigger>
          <TabsTrigger value="link">Link</TabsTrigger>
        </TabsList>

        <!-- Scan assets -->
        <TabsContent value="scan" class="space-y-4 pt-2">
          <ChainToggle v-model="chainTx" />
          <Button variant="outline" class="w-full gap-2" :disabled="tx.fetchingAssets.value" @click="runFetchAssets">
            <Loader2 v-if="tx.fetchingAssets.value" class="size-4 animate-spin" />
            <Search v-else class="size-4" />
            Scan my tokens
          </Button>

          <div v-if="ownedAssets.length" class="max-h-56 space-y-1 overflow-y-auto">
            <button
              v-for="a in ownedAssets"
              :key="`${a.chain}:${a.address}`"
              type="button"
              :class="cn(
                'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                selectedAsset && selectedAsset.address === a.address ? 'border-primary bg-accent' : 'border-border hover:bg-accent/50',
              )"
              @click="selectAsset(a)"
            >
              <TokenIcon :chain="a.chain" :image="a.image" class="size-5" />
              <span class="min-w-0">
                <span class="font-medium">{{ a.symbol }}</span>
                <span v-if="a.name" class="ml-1 truncate text-xs text-muted-foreground">{{ a.name }}</span>
              </span>
              <span class="ml-auto shrink-0 text-right">
                <span class="block tabular-nums">{{ fmtNum(a.balance) }}</span>
                <span class="block text-xs text-muted-foreground">{{ a.priceUsd != null ? fmtUsd(a.priceUsd, 4) : '—' }}</span>
              </span>
            </button>
          </div>
          <p v-else-if="assetsFetched && !tx.fetchingAssets.value" class="py-3 text-center text-sm text-muted-foreground">
            No tokens found in your wallets.
          </p>
          <p v-else-if="!assetsFetched" class="text-xs text-muted-foreground">
            Scans every {{ chainTx === 'sol' ? 'Solana' : 'Sui' }} wallet in
            <RouterLink to="/settings" class="underline hover:text-foreground">Settings</RouterLink>.
          </p>

          <!-- Pre-filled order for the selected token (editable). -->
          <div v-if="selectedAsset" class="space-y-3 rounded-md border p-3">
            <div class="flex items-center gap-2 text-sm">
              <TokenIcon :chain="selectedAsset.chain" :image="selectedAsset.image" class="size-5" />
              <span class="font-medium">{{ selectedAsset.symbol }}</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                :class="cn('rounded-md border px-3 py-2 text-sm font-medium transition-colors', assetSide === 'buy' ? 'border-profit bg-profit/10 text-profit' : 'border-border text-muted-foreground hover:bg-accent')"
                @click="assetSide = 'buy'"
              >Buy</button>
              <button
                type="button"
                :class="cn('rounded-md border px-3 py-2 text-sm font-medium transition-colors', assetSide === 'sell' ? 'border-loss bg-loss/10 text-loss' : 'border-border text-muted-foreground hover:bg-accent')"
                @click="assetSide = 'sell'"
              >Sell</button>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-2">
                <Label for="assetAmount">Amount ({{ selectedAsset.symbol }})</Label>
                <Input id="assetAmount" v-model="assetAmount" type="number" min="0" step="any" placeholder="0.00" />
              </div>
              <div class="space-y-2">
                <Label for="assetPrice">Price (USD)</Label>
                <Input id="assetPrice" v-model="assetPrice" type="number" min="0" step="any" placeholder="0.00" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-2">
                <Label for="assetDate">Date</Label>
                <Input id="assetDate" v-model="assetDate" type="datetime-local" />
              </div>
              <div class="space-y-2">
                <Label for="assetFee">Fee (USD)</Label>
                <Input id="assetFee" v-model="assetFee" type="number" min="0" step="any" />
              </div>
            </div>
            <Button class="w-full" :disabled="submitting" @click="submitAsset">
              {{ submitting ? 'Adding…' : 'Add order' }}
            </Button>
          </div>
        </TabsContent>

        <!-- Manual -->
        <TabsContent value="manual" class="space-y-4 pt-2">
          <div class="space-y-2">
            <Label>Chain</Label>
            <ChainToggle v-model="chainManual" />
          </div>

          <div class="space-y-2">
            <Label>Token</Label>
            <div class="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <TokenIcon :chain="manualTokenEffective.chain" :image="manualTokenEffective.image" class="size-5" />
              <span class="font-medium">{{ manualTokenEffective.symbol }}</span>
              <span v-if="manualTokenEffective.name" class="truncate text-xs text-muted-foreground">{{ manualTokenEffective.name }}</span>
              <button
                v-if="manualToken"
                type="button"
                class="ml-auto shrink-0 text-xs text-muted-foreground underline hover:text-foreground"
                @click="resetManualToken"
              >Use native</button>
            </div>
            <div class="flex gap-2">
              <Input
                v-model="tokenAddrInput"
                class="font-mono text-xs"
                :placeholder="chainManual === 'sol' ? 'SPL mint address' : 'Sui coin type (0x…::module::TOKEN)'"
              />
              <Button variant="outline" :disabled="tx.lookingUp.value || !tokenAddrInput.trim()" @click="lookupManualToken">
                <Loader2 v-if="tx.lookingUp.value" class="size-4 animate-spin" />
                <span v-else>Look up</span>
              </Button>
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
              <Label for="amount">Amount ({{ manualTokenEffective.symbol }})</Label>
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
            {{ editMode ? (submitting ? 'Saving…' : 'Save changes') : submitting ? 'Adding…' : 'Add order' }}
          </Button>
        </TabsContent>

        <!-- Swaps (recent swap transactions) -->
        <TabsContent value="swaps" class="space-y-4 pt-2">
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
