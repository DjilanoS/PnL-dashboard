<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { toast } from 'vue-sonner';
import { Loader2 } from '@lucide/vue';
import type { Asset, Chain, RpcHealthResponse, RpcSettings } from '@pnl/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import TokenIcon from '@/components/icons/TokenIcon.vue';
import { api } from '@/lib/api';

type Status = 'checking' | 'online' | 'offline';

const chains: { chain: Chain; asset: Asset; label: string }[] = [
  { chain: 'sol', asset: 'SOL', label: 'Solana' },
  { chain: 'sui', asset: 'SUI', label: 'Sui' },
];

const settings = ref<RpcSettings | null>(null);
const input = reactive<Record<Chain, string>>({ sol: '', sui: '' });
const saving = reactive<Record<Chain, boolean>>({ sol: false, sui: false });
const status = reactive<Record<Chain, Status>>({ sol: 'checking', sui: 'checking' });
const latency = reactive<Record<Chain, number | null>>({ sol: null, sui: null });
const timers: Record<Chain, ReturnType<typeof setTimeout> | undefined> = { sol: undefined, sui: undefined };

/** The RPC the dot reflects: what's typed, or the default when blank. */
function effectiveUrl(chain: Chain): string {
  return input[chain].trim() || settings.value?.[chain].default || '';
}

async function check(chain: Chain): Promise<void> {
  const url = effectiveUrl(chain);
  if (!url) return;
  status[chain] = 'checking';
  try {
    const res = await api.post<RpcHealthResponse>('/rpc/health', { chain, url });
    status[chain] = res.ok ? 'online' : 'offline';
    latency[chain] = res.latencyMs;
  } catch {
    status[chain] = 'offline';
    latency[chain] = null;
  }
}

/** Debounce health checks while the user is typing a custom URL. */
function onInput(chain: Chain): void {
  clearTimeout(timers[chain]);
  status[chain] = 'checking';
  timers[chain] = setTimeout(() => void check(chain), 600);
}

async function load(): Promise<void> {
  settings.value = await api.get<RpcSettings>('/settings/rpc');
  input.sol = settings.value.sol.url ?? '';
  input.sui = settings.value.sui.url ?? '';
  void check('sol');
  void check('sui');
}

async function save(chain: Chain): Promise<void> {
  saving[chain] = true;
  try {
    const url = input[chain].trim() || null;
    settings.value = await api.post<RpcSettings>('/settings/rpc', { chain, url });
    input[chain] = settings.value[chain].url ?? '';
    toast.success(`${chain.toUpperCase()} RPC saved`);
    await check(chain);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not save RPC');
  } finally {
    saving[chain] = false;
  }
}

async function reset(chain: Chain): Promise<void> {
  input[chain] = '';
  await save(chain);
}

function statusText(chain: Chain): string {
  if (status[chain] === 'checking') return 'Checking…';
  if (status[chain] === 'offline') return 'Offline';
  const ms = latency[chain];
  return ms != null ? `Online · ${ms}ms` : 'Online';
}

onMounted(load);

onBeforeUnmount(() => {
  // Cancel pending debounces so a late check() doesn't fire after teardown.
  clearTimeout(timers.sol);
  clearTimeout(timers.sui);
});
</script>

<template>
  <div class="space-y-5">
    <div v-for="c in chains" :key="c.chain" class="space-y-2">
      <div class="flex items-center justify-between">
        <Label :for="`rpc-${c.chain}`" class="flex items-center gap-2">
          <TokenIcon :asset="c.asset" class="size-4" /> {{ c.label }} RPC
        </Label>
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 v-if="status[c.chain] === 'checking'" class="size-3 animate-spin" />
          <span
            v-else
            class="size-2 rounded-full"
            :class="status[c.chain] === 'online' ? 'bg-emerald-500' : 'bg-red-500'"
          />
          {{ statusText(c.chain) }}
        </div>
      </div>

      <div class="flex gap-2">
        <Input
          :id="`rpc-${c.chain}`"
          v-model="input[c.chain]"
          class="font-mono text-xs"
          :placeholder="settings?.[c.chain].default"
          spellcheck="false"
          autocapitalize="off"
          @input="onInput(c.chain)"
        />
        <Button variant="outline" size="sm" :disabled="saving[c.chain]" @click="save(c.chain)">
          Save
        </Button>
        <Button
          v-if="input[c.chain]"
          variant="ghost"
          size="sm"
          :disabled="saving[c.chain]"
          @click="reset(c.chain)"
        >
          Default
        </Button>
      </div>

      <p class="truncate text-xs text-muted-foreground">
        Default: <span class="font-mono">{{ settings?.[c.chain].default }}</span>
      </p>
    </div>
  </div>
</template>
