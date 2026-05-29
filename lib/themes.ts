// Theme registry — single source of truth for selectable themes.
//
// next-themes applies the theme `id` as a class on <html> (attribute="class"),
// so each `id` MUST match a selector in app/globals.css:
//   'light' -> `:root, .light { ... }`
//   'dark'  -> `.dark { ... }`
//   '<id>'  -> `.<id> { ... }`   (palette themes use `.theme-*` ids)
//
// Palette themes were ported from the todoist-graph project. Each one is a
// `.theme-<id>` block in globals.css plus an entry here. `group` lets the
// switcher render an organized dropdown; `dark` flags palettes that should also
// activate the `dark:` utility variant (kept in sync with the @custom-variant
// list in globals.css).

export type ThemeId = string

export type ThemeMeta = {
  id: ThemeId
  label: string
  group: string
  dark: boolean
  // Preview swatch: [bg, cell-1, cell-2, cell-3, cell-4] — mirrors the
  // --t-bg + --t-cell-1..4 palette in globals.css. Used by the card picker.
  swatches: [string, string, string, string, string]
}

export const THEMES: ThemeMeta[] = [
  // Base (job-tracker native)
  { id: 'dark', label: 'Dark', group: 'Base', dark: true, swatches: ['#0a0a0a', '#0e4429', '#006d32', '#26a641', '#39d353'] },
  { id: 'light', label: 'Light', group: 'Base', dark: false, swatches: ['#ffffff', '#9be9d0', '#40c4aa', '#1f9d85', '#0a6b5b'] },
  // GitHub
  { id: 'theme-github-dark', label: 'GitHub Dark', group: 'GitHub', dark: true, swatches: ['#0d1117', '#0e4429', '#006d32', '#26a641', '#39d353'] },
  { id: 'theme-github-light', label: 'GitHub Light', group: 'GitHub', dark: false, swatches: ['#ffffff', '#9be9d0', '#40c4aa', '#1f9d85', '#0a6b5b'] },
  // Claude
  { id: 'theme-claude-dark', label: 'Claude Dark', group: 'Claude', dark: true, swatches: ['#1f1e1c', '#5a3a1f', '#8c5a2e', '#d97757', '#ffb38a'] },
  { id: 'theme-claude-light', label: 'Claude Light', group: 'Claude', dark: false, swatches: ['#faf9f5', '#f0d4b4', '#e3a063', '#c87f43', '#a3582a'] },
  // Todoist
  { id: 'theme-todoist-dark', label: 'Todoist Dark', group: 'Todoist', dark: true, swatches: ['#1f1f1f', '#5a221d', '#9a3a30', '#dc4c3e', '#ff7a6e'] },
  { id: 'theme-todoist-light', label: 'Todoist Light', group: 'Todoist', dark: false, swatches: ['#ffffff', '#f6c3bf', '#ec8079', '#dc4c3e', '#a32c20'] },
  { id: 'theme-todoist-tangerine', label: 'Tangerine', group: 'Todoist', dark: true, swatches: ['#1a1410', '#5c2f12', '#a45821', '#ff8a3d', '#ffcf99'] },
  { id: 'theme-todoist-moonstone', label: 'Moonstone', group: 'Todoist', dark: true, swatches: ['#1a1f26', '#2f4257', '#4d6d8f', '#7da3c7', '#b8d0e6'] },
  { id: 'theme-todoist-kale', label: 'Kale', group: 'Todoist', dark: true, swatches: ['#131a14', '#2b4a32', '#46784e', '#6cb273', '#b3e0b0'] },
  { id: 'theme-todoist-lavender', label: 'Lavender', group: 'Todoist', dark: true, swatches: ['#19151f', '#3d2e5a', '#6347a0', '#9b7ed9', '#d6c4f5'] },
  { id: 'theme-todoist-raspberry', label: 'Raspberry', group: 'Todoist', dark: true, swatches: ['#1a1015', '#5a1d3a', '#9a2f63', '#d94a8b', '#f7a5cd'] },
  { id: 'theme-todoist-bubblegum', label: 'Bubblegum', group: 'Todoist', dark: false, swatches: ['#fef5f8', '#f9b5cd', '#f17ba6', '#d63d7c', '#921e54'] },
  { id: 'theme-todoist-sunset', label: 'Sunset', group: 'Todoist', dark: true, swatches: ['#1c1218', '#5e2438', '#b03f56', '#f17a3d', '#ffd166'] },
  { id: 'theme-todoist-bordeaux', label: 'Bordeaux', group: 'Todoist', dark: true, swatches: ['#170c0d', '#4a1418', '#842028', '#c43040', '#f06474'] },
  { id: 'theme-todoist-teal', label: 'Teal Tide', group: 'Todoist', dark: true, swatches: ['#0e1a1c', '#1d4a52', '#2f8593', '#46c5d4', '#a5edf2'] },
  { id: 'theme-todoist-pacific', label: 'Pacific Sky', group: 'Todoist', dark: true, swatches: ['#0c1624', '#173a6a', '#2069b8', '#4ea8ff', '#b6dcff'] },
]

// Dark-first per product direction (atmospheric, calm).
export const DEFAULT_THEME: ThemeId = 'dark'

export const THEME_IDS = THEMES.map((t) => t.id)

// Ordered, de-duplicated group names for grouped rendering in the switcher.
export const THEME_GROUPS = [...new Set(THEMES.map((t) => t.group))]
