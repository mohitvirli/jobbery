// Theme registry — single source of truth for selectable themes.
//
// Each theme maps to a CSS class block in app/globals.css. next-themes applies
// the theme `id` as a class on <html> (attribute="class"), so `id` MUST match a
// selector in globals.css:
//   'dark'  -> `.dark { ... }`
//   'light' -> `:root, .light { ... }`
//
// Adding a theme later is two steps, no refactor:
//   1. Add a `.theme-<id> { --background: ...; ... }` block in globals.css
//   2. Append an entry here
// The provider and any theme switcher read THEMES, so new themes appear
// automatically wherever themes are listed.

export type ThemeId = 'dark' | 'light'

export type ThemeMeta = {
  id: ThemeId
  label: string
}

export const THEMES: ThemeMeta[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
]

// Dark-first per product direction (atmospheric, calm).
export const DEFAULT_THEME: ThemeId = 'dark'

export const THEME_IDS = THEMES.map((t) => t.id)
