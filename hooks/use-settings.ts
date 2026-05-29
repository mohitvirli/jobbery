'use client'

// React binding over the settings module. Mirrors use-applications: components
// read settings here, never the storage functions directly. Subscribes to the
// same-tab CustomEvent and the cross-tab `storage` event so every consumer stays
// in sync after a write.

import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_SETTINGS,
  SETTINGS_EVENT,
  getSettings,
  setSettings as persist,
  type Settings,
} from '@/lib/settings'

export function useSettings() {
  // Start from defaults so server and first client render match; the effect
  // hydrates from localStorage right after mount.
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS)

  useEffect(() => {
    const sync = () => setSettingsState(getSettings())
    sync() // hydrate from localStorage on mount
    window.addEventListener(SETTINGS_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(SETTINGS_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const update = useCallback((patch: Partial<Settings>) => {
    // persist() broadcasts SETTINGS_EVENT, which fires `sync` above — no manual
    // setState needed here, keeping all consumers on one update path.
    persist(patch)
  }, [])

  return { settings, update }
}
