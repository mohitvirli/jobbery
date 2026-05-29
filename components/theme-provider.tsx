'use client'

// Thin wrapper over next-themes. Centralizes config so the rest of the app
// never imports next-themes directly — swapping theming libs later touches only
// this file. Theme list + default come from lib/themes.ts (single source).

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { THEME_IDS, DEFAULT_THEME } from '@/lib/themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class" // applies theme id as a class on <html>; matches Coss's .dark variant
      defaultTheme={DEFAULT_THEME}
      themes={THEME_IDS}
      enableSystem={false} // explicit themes only in v0; flip on later if wanted
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
