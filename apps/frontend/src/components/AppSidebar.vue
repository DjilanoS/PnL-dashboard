<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { ChevronsLeft, ChevronsRight, LineChart } from '@lucide/vue';
import { navItems } from '@/lib/nav';
import { cn } from '@/lib/utils';

defineProps<{ collapsed: boolean }>();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <aside class="flex flex-col gap-2 border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground">
    <!-- Brand + collapse toggle -->
    <div class="flex items-center gap-2" :class="collapsed ? 'flex-col' : ''">
      <RouterLink to="/" class="flex min-w-0 items-center gap-2 font-semibold">
        <img src="@/assets/logo.png" alt="Logo" class="h-8 w-8" />
        <span v-if="!collapsed" class="truncate">Gainly</span>
      </RouterLink>
      <button
        type="button"
        class="grid size-7 place-items-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        :class="collapsed ? '' : 'ml-auto'"
        :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="$emit('toggle')"
      >
        <ChevronsRight v-if="collapsed" class="size-4" />
        <ChevronsLeft v-else class="size-4" />
      </button>
    </div>

    <nav class="mt-2 flex flex-col gap-1 text-sm">
      <RouterLink
        v-for="item in navItems"
        :key="item.name"
        :to="item.to"
        :title="collapsed ? item.label : undefined"
        :class="
          cn(
            'flex items-center gap-2 rounded-md px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            collapsed ? 'justify-center px-0' : '',
          )
        "
        exact-active-class="bg-sidebar-accent text-sidebar-accent-foreground"
      >
        <component :is="item.icon" class="size-4 shrink-0" />
        <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
      </RouterLink>
    </nav>
  </aside>
</template>
