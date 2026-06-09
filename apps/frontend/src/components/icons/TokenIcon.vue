<script setup lang="ts">
import { computed, ref, watch, type HTMLAttributes } from 'vue';
import type { Asset, Chain } from '@pnl/types';
import { cn } from '@/lib/utils';
import SolanaMark from './SolanaMark.vue';
import SuiMark from './SuiMark.vue';

const props = defineProps<{
  /** Legacy native-symbol hint ('SOL'|'SUI'); also used to derive the chain. */
  asset?: Asset;
  /** Explicit chain (preferred for arbitrary tokens). */
  chain?: Chain;
  /** Token logo URL; falls back to the chain mark when absent or on load error. */
  image?: string;
  class?: HTMLAttributes['class'];
}>();

// Resolve the chain from an explicit prop, else the legacy `asset` hint.
const chain = computed<Chain>(() => props.chain ?? (props.asset === 'SUI' ? 'sui' : 'sol'));
const mark = computed(() => (chain.value === 'sol' ? SolanaMark : SuiMark));
// Brand color by default; overridable via a passed text-* class (tailwind-merge wins).
const color = computed(() => (chain.value === 'sol' ? 'text-solana' : 'text-sui'));

// Prefer the token logo when given; reset the error flag if the URL changes.
const failed = ref(false);
watch(
  () => props.image,
  () => {
    failed.value = false;
  },
);
const showImage = computed(() => !!props.image && !failed.value);
</script>

<template>
  <img
    v-if="showImage"
    :src="props.image"
    alt=""
    :class="cn('size-4 shrink-0 rounded-full object-cover', props.class)"
    @error="failed = true"
  />
  <component :is="mark" v-else :class="cn('size-4 shrink-0', color, props.class)" />
</template>
