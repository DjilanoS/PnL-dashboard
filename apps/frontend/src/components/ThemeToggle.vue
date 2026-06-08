<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/composables/useTheme';

const { mode, toggle } = useTheme();
</script>

<template>
  <Button variant="ghost" size="icon" aria-label="Toggle theme" @click="toggle">
    <Moon v-if="mode === 'dark'" class="size-5" />
    <Sun v-else class="size-5" />
  </Button>
</template>
