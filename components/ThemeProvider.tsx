'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'light', toggle: () => {} });

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialThemePreference(): Theme {
  if (typeof window === 'undefined') return 'light';
  const saved = localStorage.getItem('vp-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return getSystemTheme();
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Keep the server render and the first client render identical. The inline
  // layout script applies the saved class before paint; this effect then syncs
  // React state without causing a hydration mismatch.
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const preferred = getInitialThemePreference();
    setTheme(preferred);
    applyTheme(preferred);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMediaChange = () => {
      const saved = localStorage.getItem('vp-theme');
      if (saved === 'light' || saved === 'dark') return;
      setTheme(media.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', onMediaChange);
    return () => media.removeEventListener('change', onMediaChange);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'vp-theme') return;
      if (event.newValue === 'light' || event.newValue === 'dark') {
        setTheme(event.newValue);
        return;
      }
      setTheme(getSystemTheme());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function toggle() {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('vp-theme', next);
      return next;
    });
  }

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
