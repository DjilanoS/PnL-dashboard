<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue';
import type { Asset } from '@pnl/types';
import { cn } from '@/lib/utils';
import SolanaMark from './SolanaMark.vue';
import SuiMark from './SuiMark.vue';

const props = defineProps<{ asset: Asset; class?: HTMLAttributes['class'] }>();

const mark = computed(() => (props.asset === 'SOL' ? SolanaMark : SuiMark));
// Brand color by default; overridable via a passed text-* class (tailwind-merge wins).
const color = computed(() => (props.asset === 'SOL' ? 'text-solana' : 'text-sui'));
</script>

<template>
  <component :is="mark" :class="cn('size-4 shrink-0', color, props.class)" />
</template>
