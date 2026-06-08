import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from '@/stores/useAuth';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      // Discord OAuth lands here with the JWT in the URL fragment.
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('@/views/AuthCallbackView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
    },
    {
      path: '/orders',
      name: 'orders',
      component: () => import('@/views/OrdersView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach((to) => {
  const { isAuthenticated } = useAuth();
  if (!to.meta.public && !isAuthenticated.value) {
    return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : undefined };
  }
  if (to.name === 'login' && isAuthenticated.value) {
    return { name: 'dashboard' };
  }
  return true;
});

export default router;
