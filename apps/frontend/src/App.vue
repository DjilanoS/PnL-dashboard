<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ConfigProvider } from 'reka-ui';
import AppShell from '@/components/AppShell.vue';
import { Toaster } from '@/components/ui/sonner';
import { useAuth } from '@/stores/useAuth';

const route = useRoute();
const auth = useAuth();

// Refresh identity + tracked wallets from the API after a reload (the JWT
// persists in localStorage). Fire-and-forget: a transient failure shouldn't
// block render, and a real 401 is handled by the api layer (→ logout). The
// callback view owns hydration on the OAuth landing, so skip it there.
onMounted(() => {
  if (auth.isAuthenticated.value && route.name !== 'auth-callback') {
    void auth.hydrate().catch(() => {});
  }
});
</script>

<template>
  <!-- scroll-body=false stops reka-ui from adding body padding-right (scrollbar
       compensation) when an overlay opens, which was squishing the layout. -->
  <ConfigProvider :scroll-body="false">
    <div class="min-h-screen bg-background text-foreground antialiased">
      <RouterView v-if="route.meta.public" />
      <AppShell v-else>
        <RouterView />
      </AppShell>
      <Toaster :rich-colors="true" position="top-right" theme="dark" />
    </div>
  </ConfigProvider>
</template>
