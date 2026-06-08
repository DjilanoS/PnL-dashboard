<script setup lang="ts">
import { watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import DiscordMark from '@/components/icons/DiscordMark.vue';
import { useAuth } from '@/stores/useAuth';

const router = useRouter();
const route = useRoute();
const { isAuthenticated } = useAuth();

const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// Persisted across the full-page OAuth round-trip (sessionStorage survives the
// navigation to Discord and back to this origin); the redirect can't ride along
// as a query param because the callback URL only carries the token fragment.
const REDIRECT_KEY = 'pnl.postLoginRedirect';

function loginWithDiscord(): void {
  const redirect = route.query.redirect;
  // Only same-origin paths, never an absolute/protocol-relative URL (open redirect).
  if (typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')) {
    sessionStorage.setItem(REDIRECT_KEY, redirect);
  }
  // Full-page navigation (not XHR): Discord must redirect the browser back, and
  // @fastify/oauth2 sets its CSRF state cookie first-party on the API origin.
  window.location.href = `${apiBase}/auth/discord`;
}

// Already authenticated (valid token in storage) → go straight to the app.
watch(
  isAuthenticated,
  (authed) => {
    if (authed) {
      const redirect = route.query.redirect;
      router.replace(typeof redirect === 'string' ? redirect : '/');
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="grid min-h-screen place-items-center px-4">
    <Card class="w-full max-w-md border-border/60">
      <CardHeader class="space-y-2 text-center">
        <CardTitle class="text-3xl font-bold tracking-tight">
          <span class="text-gradient-solana">Sol</span><span class="text-gradient-sui">Sui</span>
          <span class="text-foreground"> PnL</span>
        </CardTitle>
        <CardDescription> Sign in with Discord to view your portfolio PnL. </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col items-center gap-4 pb-8">
        <Button
          class="w-full gap-2 bg-[#5865F2] text-white hover:bg-[#4752c4]"
          @click="loginWithDiscord"
        >
          <DiscordMark class="size-4" /> Sign in with Discord
        </Button>
        <p class="max-w-xs text-center text-xs text-muted-foreground">
          We only read your Discord username. Connect Solana &amp; Sui wallets later in Settings.
        </p>
      </CardContent>
    </Card>
  </div>
</template>
