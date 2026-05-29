// User settings (preferences), persisted to localStorage. Separate key from the
// applications data so the two evolve independently. Same Supabase-ready seam
// idea as storage.ts — callers go through use-settings, never touch this
// directly. v0 is single-user (key is not user-scoped); when auth lands this
// gains a userId like the storage layer.
//
// Reactivity: writes broadcast a CustomEvent so every mounted consumer (the
// settings dialog AND the stats row) re-reads in sync, plus the native `storage`
// event keeps other tabs consistent.

const SETTINGS_KEY = 'job-tracker:settings'
export const SETTINGS_EVENT = 'job-tracker:settings-changed'

export type Settings = {
  weeklyTarget: number
}

export const DEFAULT_SETTINGS: Settings = {
  weeklyTarget: 5,
}

export function getSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS // SSR guard
  const raw = window.localStorage.getItem(SETTINGS_KEY)
  if (!raw) return DEFAULT_SETTINGS
  try {
    // Merge over defaults so a missing/new key never reads as undefined.
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  // Notify same-tab listeners (storage event only fires in *other* tabs).
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT))
  return next
}
