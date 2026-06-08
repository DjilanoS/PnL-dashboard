<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import { Loader2 } from '@lucide/vue';
import { useAuth } from '@/stores/useAuth';

const router = useRouter();
const auth = useAuth();

// Matches LoginView's key — where the user was headed before the OAuth round-trip.
const REDIRECT_KEY = 'pnl.postLoginRedirect';

onMounted(async () => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get('token');
  const error = params.get('error');

  // Strip the fragment so the JWT doesn't linger in the URL or history.
  history.replaceState(null, '', window.location.pathname + window.location.search);

  if (error || !token) {
    toast.error('Discord sign-in failed. Please try again.');
    void router.replace({ name: 'login' });
    return;
  }

  auth.setToken(token);
  try {
    await auth.hydrate();
  } catch {
    // A transient /auth/me failure shouldn't nuke a valid fresh token; proceed.
    // (A real 401 is handled by the api layer, which logs out + bounces to login.)
  }
  // Restore the pre-login destination (saved by LoginView). Re-validate it's a
  // same-origin path before navigating.
  const saved = sessionStorage.getItem(REDIRECT_KEY);
  sessionStorage.removeItem(REDIRECT_KEY);
  const redirect = saved && saved.startsWith('/') && !saved.startsWith('//') ? saved : '/';
  void router.replace(redirect);
});
</script>

<template>
  <div class="grid min-h-screen place-items-center px-4">
    <div class="flex items-center gap-3 text-muted-foreground">
      <Loader2 class="size-5 animate-spin" />
      <span>Signing you in…</span>
    </div>
  </div>
</template>
