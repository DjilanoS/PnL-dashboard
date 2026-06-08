<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { LayoutDashboard, LineChart, LogOut, Menu, Receipt, Settings, X } from '@lucide/vue';
import {
  DialogRoot,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from 'reka-ui';
import ThemeToggle from '@/components/ThemeToggle.vue';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/stores/useAuth';

const router = useRouter();
const { isAuthenticated, logout } = useAuth();

const menuOpen = ref(false);

const nav = [
  { name: 'dashboard', label: 'Dashboard', to: '/', icon: LayoutDashboard },
  { name: 'orders', label: 'Orders', to: '/orders', icon: Receipt },
  { name: 'settings', label: 'Settings', to: '/settings', icon: Settings },
];

function onLogout(): void {
  menuOpen.value = false;
  logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <header class="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
    <div class="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:gap-6 md:px-6">
      <RouterLink to="/" class="flex shrink-0 items-center gap-2 font-semibold">
        <span class="grid size-8 place-items-center rounded-lg bg-gradient-solana text-black">
          <LineChart class="size-4" />
        </span>
        <span class="hidden sm:inline">PnL<span class="text-muted-foreground"> Dashboard</span></span>
      </RouterLink>

      <!-- Desktop nav -->
      <nav class="hidden items-center gap-1 text-sm md:flex">
        <RouterLink
          v-for="item in nav"
          :key="item.name"
          :to="item.to"
          class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
          exact-active-class="bg-accent text-foreground"
        >
          <component :is="item.icon" class="size-4" />
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="ml-auto flex items-center gap-1 sm:gap-2">
        <ThemeToggle />

        <!-- Desktop logout (mobile logout lives in the slide-out menu) -->
        <Button
          v-if="isAuthenticated"
          variant="ghost"
          size="icon"
          class="hidden md:inline-flex"
          aria-label="Log out"
          @click="onLogout"
        >
          <LogOut class="size-5" />
        </Button>

        <!-- Mobile nav menu: slides in from the right -->
        <DialogRoot v-model:open="menuOpen">
          <DialogTrigger as-child>
            <Button variant="ghost" size="icon" class="md:hidden" aria-label="Open menu">
              <Menu class="size-5" />
            </Button>
          </DialogTrigger>
          <DialogPortal>
            <DialogOverlay
              class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
            />
            <DialogContent
              class="fixed inset-y-0 right-0 z-50 flex w-72 max-w-[80vw] flex-col gap-2 border-l border-border/60 bg-background p-4 shadow-lg duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
            >
              <div class="flex items-center justify-between">
                <DialogTitle class="text-sm font-semibold">Menu</DialogTitle>
                <DialogClose as-child>
                  <Button variant="ghost" size="icon-sm" aria-label="Close menu">
                    <X class="size-4" />
                  </Button>
                </DialogClose>
              </div>
              <DialogDescription class="sr-only">Site navigation</DialogDescription>

              <nav class="mt-2 flex flex-col gap-1 text-sm">
                <RouterLink
                  v-for="item in nav"
                  :key="item.name"
                  :to="item.to"
                  class="flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  exact-active-class="bg-accent text-foreground"
                  @click="menuOpen = false"
                >
                  <component :is="item.icon" class="size-4" />
                  {{ item.label }}
                </RouterLink>
              </nav>

              <Button
                v-if="isAuthenticated"
                variant="ghost"
                class="mt-auto justify-start gap-2 text-destructive hover:text-destructive"
                @click="onLogout"
              >
                <LogOut class="size-4" /> Log out
              </Button>
            </DialogContent>
          </DialogPortal>
        </DialogRoot>
      </div>
    </div>
  </header>
</template>
