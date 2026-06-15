import type { Component } from 'vue';
import { LayoutDashboard, Receipt, Settings } from '@lucide/vue';

/** A primary navigation entry, shared by the sidebar and the mobile drawer. */
export interface NavItem {
  name: string;
  label: string;
  to: string;
  icon: Component;
}

export const navItems: NavItem[] = [
  { name: 'dashboard', label: 'Dashboard', to: '/', icon: LayoutDashboard },
  { name: 'orders', label: 'Orders', to: '/orders', icon: Receipt },
  { name: 'settings', label: 'Settings', to: '/settings', icon: Settings },
];
