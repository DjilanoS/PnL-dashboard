import { useColorMode } from '@vueuse/core';

/** Dark-by-default color mode, toggling the `.dark` class on <html>. */
const mode = useColorMode({ initialValue: 'dark', storageKey: 'pnl.theme' });

export function useTheme() {
  const toggle = () => {
    mode.value = mode.value === 'dark' ? 'light' : 'dark';
  };
  return { mode, toggle };
}
