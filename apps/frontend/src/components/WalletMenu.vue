<script lang="ts">
import type { Asset } from '@pnl/types';

/** A wallet the user can pick to connect, normalized across chains. */
export interface WalletOption {
  name: string;
  icon?: string;
  onSelect: () => void | Promise<void>;
}

/** Chain-agnostic shape that drives the shared wallet button/dropdown. */
export interface WalletMenuAdapter {
  /** Drives the brand logo + accent color. */
  asset: Asset;
  /** Human label, e.g. "Solana" / "Sui". */
  label: string;
  /** Connectable wallets, shown when not connected. */
  wallets: WalletOption[];
  /** Shown when no wallet is detected. */
  noWalletText: string;
  connected: boolean;
  address: string | null;
  /** Whether the connected address has completed its action (signed in / added). */
  authed: boolean;
  busy: boolean;
  onSignIn: () => void | Promise<void>;
  onDisconnect: () => void | Promise<void>;
  /** Primary action label when connected & not yet done (default "Sign in"). */
  actionLabel?: string;
  /** Label shown (disabled) once done (default "Signed in"). */
  actionDoneLabel?: string;
}
</script>

<script setup lang="ts">
import { Check, ChevronDown, LogOut } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import TokenIcon from '@/components/icons/TokenIcon.vue';
import { cn } from '@/lib/utils';

defineProps<{ adapter: WalletMenuAdapter; compact?: boolean }>();

function short(a: string | null): string {
  return a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '';
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline" size="sm" class="gap-1.5 sm:gap-2">
        <TokenIcon :asset="adapter.asset" class="size-4" />
        <span
          v-if="adapter.connected && adapter.address"
          :class="cn('font-mono text-xs', compact && 'hidden sm:inline')"
          >{{ short(adapter.address) }}</span
        >
        <span v-else :class="cn(compact && 'hidden sm:inline')">{{ adapter.label }}</span>
        <Check
          v-if="adapter.authed"
          class="size-3.5"
          :class="adapter.asset === 'SOL' ? 'text-solana' : 'text-sui'"
        />
        <ChevronDown class="size-3.5 opacity-60" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-56">
      <template v-if="!adapter.connected">
        <DropdownMenuLabel>Connect a {{ adapter.label }} wallet</DropdownMenuLabel>
        <DropdownMenuItem
          v-for="w in adapter.wallets"
          :key="w.name"
          class="gap-2"
          @click="w.onSelect()"
        >
          <img v-if="w.icon" :src="w.icon" :alt="w.name" class="size-4 rounded" />
          {{ w.name }}
        </DropdownMenuItem>
        <DropdownMenuItem v-if="adapter.wallets.length === 0" disabled>
          {{ adapter.noWalletText }}
        </DropdownMenuItem>
      </template>
      <template v-else>
        <DropdownMenuLabel class="flex items-center gap-2 font-mono text-xs">
          <TokenIcon :asset="adapter.asset" class="size-3.5" />
          {{ short(adapter.address) }}
        </DropdownMenuLabel>
        <DropdownMenuItem v-if="!adapter.authed" :disabled="adapter.busy" @click="adapter.onSignIn()">
          <Check class="size-4" /> {{ adapter.actionLabel ?? 'Sign in' }}
        </DropdownMenuItem>
        <DropdownMenuItem v-else disabled>
          <Check class="size-4" :class="adapter.asset === 'SOL' ? 'text-solana' : 'text-sui'" />
          {{ adapter.actionDoneLabel ?? 'Signed in' }}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem class="text-destructive" @click="adapter.onDisconnect()">
          <LogOut class="size-4" /> Disconnect
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
