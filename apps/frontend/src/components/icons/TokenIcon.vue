<script setup lang="ts">
import { computed, ref, watch, type HTMLAttributes } from 'vue';
import type { Asset, Chain } from '@pnl/types';
import { cn } from '@/lib/utils';
import { knownTokenLogo } from '@/lib/tokenLogos';
import SolanaMark from './SolanaMark.vue';
import SuiMark from './SuiMark.vue';

const props = defineProps<{
  /** Legacy native-symbol hint ('SOL'|'SUI'); also used to derive the chain + fallback logo. */
  asset?: Asset;
  /** Explicit chain (preferred for arbitrary tokens). */
  chain?: Chain;
  /** Token logo URL; falls back to a known-token logo, then the chain mark. */
  image?: string;
  class?: HTMLAttributes['class'];
}>();

// Resolve the chain from an explicit prop, else the legacy `asset` hint.
const chain = computed<Chain>(() => props.chain ?? (props.asset === 'SUI' ? 'sui' : 'sol'));
const mark = computed(() => (chain.value === 'sol' ? SolanaMark : SuiMark));
// Brand color by default; overridable via a passed text-* class (tailwind-merge wins).
const color = computed(() => (chain.value === 'sol' ? 'text-solana' : 'text-sui'));

// Prefer the API image, then a known-token logo (SOL/SUI/USDC), else the chain mark.
const resolvedImage = computed(() => props.image || knownTokenLogo(props.asset));

const failed = ref(false);
watch(resolvedImage, () => {
  failed.value = false;
});
const showImage = computed(() => !!resolvedImage.value && !failed.value);
</script>

<template>
  <span
    :class="
      cn('inline-grid aspect-square size-4 shrink-0 place-items-center overflow-hidden rounded-full', props.class)
    "
  >
    <img
      v-if="showImage"
      :src="resolvedImage"
      alt=""
      class="size-full object-cover"
      @error="failed = true"
    />
    <component :is="mark" v-else :class="cn('size-[78%]', color)" />
  </span>
</template>
