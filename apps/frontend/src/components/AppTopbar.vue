<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router';
import { LogOut, Menu } from '@lucide/vue';
import ThemeToggle from '@/components/ThemeToggle.vue';
import { Button } from '@/components/ui/button';
import { usePortfolio } from '@/stores/usePortfolio';
import { useAuth } from '@/stores/useAuth';
import { fmtUsd } from '@/lib/format';

defineEmits<{ 'open-mobile-nav': [] }>();

const router = useRouter();
const { holdings } = usePortfolio();
const { isAuthenticated, logout } = useAuth();

function onLogout(): void {
  logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <header
    class="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur md:px-6"
  >
    <!-- Mobile: hamburger + compact brand (the full brand lives in the sidebar) -->
    <Button
      variant="ghost"
      size="icon"
      class="lg:hidden"
      aria-label="Open menu"
      @click="$emit('open-mobile-nav')"
    >
      <Menu class="size-5" />
    </Button>
    <RouterLink to="/" class="flex items-center gap-2 font-semibold lg:hidden">
      <img src="@/assets/logo.png" alt="Logo" class="h-7 w-7" />
    </RouterLink>

    <div class="ml-auto flex items-center gap-2 sm:gap-3">
      <div
        v-if="holdings"
        class="flex items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-1.5"
      >
        <span class="hidden text-xs text-muted-foreground sm:inline">Portfolio</span>
        <span class="text-sm font-semibold tabular-nums">{{ fmtUsd(holdings.totalValueUsd) }}</span>
      </div>
      <ThemeToggle />
      <Button v-if="isAuthenticated" variant="ghost" size="icon" aria-label="Log out" @click="onLogout">
        <LogOut class="size-5" />
      </Button>
    </div>
  </header>
</template>
