<script setup lang="ts">
import { onMounted } from 'vue';
import { toast } from 'vue-sonner';
import { Server, Trash2 } from '@lucide/vue';
import type { Asset, Chain, WalletDTO } from '@pnl/types';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import TokenIcon from '@/components/icons/TokenIcon.vue';
import WalletMenu from '@/components/WalletMenu.vue';
import RpcSettings from '@/components/RpcSettings.vue';
import { useWallets } from '@/stores/useWallets';
import { useWalletAdapters } from '@/composables/useWalletAdapters';
import { fmtDate, shortAddress } from '@/lib/format';
import { accountExplorerUrl } from '@/lib/explorer';

const { wallets, fetchWallets, removeWallet } = useWallets();
const { solAdapter, suiAdapter } = useWalletAdapters();

onMounted(() => fetchWallets());

const groups: { chain: Chain; asset: Asset; label: string }[] = [
  { chain: 'sol', asset: 'SOL', label: 'Solana' },
  { chain: 'sui', asset: 'SUI', label: 'Sui' },
];

function listFor(chain: Chain): WalletDTO[] {
  return chain === 'sol' ? wallets.value.sol : wallets.value.sui;
}

async function remove(w: WalletDTO): Promise<void> {
  if (!window.confirm(`Remove ${shortAddress(w.address)} from your wallets?`)) return;
  try {
    await removeWallet(w.id);
    toast.success('Wallet removed');
  } catch {
    toast.error('Could not remove wallet');
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
      <p class="text-sm text-muted-foreground">
        Connect Solana &amp; Sui wallets to track your portfolio.
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <Server class="size-4 text-muted-foreground" /> RPC endpoints
        </CardTitle>
        <CardDescription>
          Use your own Solana &amp; Sui RPC for balances and transaction-link imports.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RpcSettings />
      </CardContent>
    </Card>

    <Card v-for="g in groups" :key="g.chain">
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <TokenIcon :asset="g.asset" class="size-4" /> Your {{ g.label }} wallets
        </CardTitle>
        <CardAction>
          <WalletMenu :adapter="g.chain === 'sol' ? solAdapter : suiAdapter" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <p v-if="listFor(g.chain).length === 0" class="text-sm text-muted-foreground">
          No {{ g.label }} wallets yet — use
          <span class="font-medium text-foreground">Connect</span> above.
        </p>
        <div v-else class="space-y-2">
          <div
            v-for="w in listFor(g.chain)"
            :key="w.id"
            class="flex items-center justify-between gap-3 rounded-lg border bg-card/40 p-3"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <a
                  :href="accountExplorerUrl(g.chain, w.address)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="font-mono text-sm underline-offset-2 hover:text-foreground hover:underline"
                  >{{ shortAddress(w.address) }}</a
                >
                <span
                  v-if="w.label"
                  class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                  >{{ w.label }}</span
                >
              </div>
              <div class="text-xs text-muted-foreground">Added {{ fmtDate(w.verifiedAt) }}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              class="text-destructive hover:text-destructive"
              aria-label="Remove wallet"
              @click="remove(w)"
            >
              <Trash2 class="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
