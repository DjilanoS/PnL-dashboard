<script setup lang="ts">
import type { Chain } from '@pnl/types';
import { cn } from '@/lib/utils';

const model = defineModel<Chain>({ required: true });
</script>

<template>
  <div class="grid grid-cols-2 gap-2">
    <button
      type="button"
      :class="cn(
        'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
        model === 'sol' ? 'border-solana bg-solana/10 text-solana' : 'border-border text-muted-foreground hover:bg-accent',
      )"
      @click="model = 'sol'"
    >
      Solana
    </button>
    <button
      type="button"
      :class="cn(
        'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
        model === 'sui' ? 'border-sui bg-sui/10 text-sui' : 'border-border text-muted-foreground hover:bg-accent',
      )"
      @click="model = 'sui'"
    >
      Sui
    </button>
  </div>
</template>
