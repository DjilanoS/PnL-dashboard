<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useLocalStorage } from '@vueuse/core';
import { LogOut, X } from '@lucide/vue';
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from 'reka-ui';
import AppSidebar from '@/components/AppSidebar.vue';
import AppTopbar from '@/components/AppTopbar.vue';
import { Button } from '@/components/ui/button';
import { navItems } from '@/lib/nav';
import { useAuth } from '@/stores/useAuth';

// Persisted collapse state — matches the `pnl.*` localStorage convention.
const collapsed = useLocalStorage('pnl.sidebar.collapsed', false);
const mobileOpen = ref(false);

const router = useRouter();
const { isAuthenticated, logout } = useAuth();

function onLogout(): void {
  mobileOpen.value = false;
  logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <div
    class="grid min-h-screen grid-cols-1"
    :class="collapsed ? 'lg:grid-cols-[4rem_1fr]' : 'lg:grid-cols-[16rem_1fr]'"
  >
    <AppSidebar :collapsed="collapsed" class="hidden lg:flex" @toggle="collapsed = !collapsed" />

    <div class="flex min-w-0 flex-col">
      <AppTopbar @open-mobile-nav="mobileOpen = true" />
      <main class="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 md:px-6 lg:px-8">
        <slot />
      </main>
    </div>

    <!-- Mobile nav drawer: slides in from the left -->
    <DialogRoot v-model:open="mobileOpen">
      <DialogPortal>
        <DialogOverlay
          class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 lg:hidden"
        />
        <DialogContent
          class="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col gap-2 border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground shadow-lg duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left lg:hidden"
        >
          <div class="flex items-center justify-between">
            <DialogTitle class="flex items-center gap-2 text-sm font-semibold">
              <img src="@/assets/logo.png" alt="" class="h-8 w-8" />
            </DialogTitle>
            <DialogClose as-child>
              <Button variant="ghost" size="icon-sm" aria-label="Close menu">
                <X class="size-4" />
              </Button>
            </DialogClose>
          </div>
          <DialogDescription class="sr-only">Site navigation</DialogDescription>

          <nav class="mt-2 flex flex-col gap-1 text-sm">
            <RouterLink
              v-for="item in navItems"
              :key="item.name"
              :to="item.to"
              class="flex items-center gap-2 rounded-md px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              exact-active-class="bg-sidebar-accent text-sidebar-accent-foreground"
              @click="mobileOpen = false"
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
</template>
