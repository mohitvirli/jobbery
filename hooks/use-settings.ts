'use client'

// React binding over the settings module. Mirrors use-applications: components
// read settings here, never the storage functions directly. Subscribes to the
// same-tab CustomEvent and the cross-tab `storage` event so every consumer stays
// in sync after a write.
//
// Auth modes:
//   - Guest: EXACTLY the v0 behavior — weeklyTarget reads/writes localStorage
//     only, broadcasting SETTINGS_EVENT. Zero Supabase calls.
//   - Authed: weeklyTarget syncs through Supabase `user_settings`. localStorage
//     stays a fast read-through cache for instant paint; writes go to BOTH
//     (last-write-wins, like CachedStore). Theme is NOT here — next-themes owns
//     it, and it stays device-local intentionally.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import {
  DEFAULT_SETTINGS,
  SETTINGS_EVENT,
  getSettings,
  setSettings as persist,
  type Settings,
} from '@/lib/settings'
import { createClient } from '@/lib/supabase/client'
import { UserSettingsStore } from '@/lib/user-settings-store'

export function useSettings() {
  const { isGuest, user, loading: authLoading } = useAuth()

  // Start from defaults so server and first client render match; the effects
  // below hydrate from localStorage (instant) then Supabase (authoritative).
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS)

  // Remote settings store only exists when authed (guests never touch Supabase).
  const remote = useMemo(() => {
    if (isGuest || !user) return null
    return new UserSettingsStore(createClient())
    // user.id is the only field that affects the store; recreate on user switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, user?.id])

  // localStorage hydration + cross-tab / same-tab reactivity. This is the only
  // sync path for guests and the instant-paint cache for authed users.
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

  // Authed: reconcile weeklyTarget against Supabase (authoritative). Mirror the
  // remote value into localStorage so the next paint is instant and other
  // consumers re-read via SETTINGS_EVENT.
  //
  // Same pass reports this browser's IANA zone if the stored one is missing or
  // stale. The MCP server runs in UTC and reads that column to bucket days the
  // way the dashboard does — this is the only place it ever gets written.
  useEffect(() => {
    if (authLoading || !remote || !user) return
    let active = true
    remote
      .get(user.id)
      .then(({ weeklyTarget, timeZone }) => {
        if (!active) return
        // persist() updates the localStorage cache AND broadcasts, which fires
        // the `sync` listener above — no manual setState needed here.
        persist({ weeklyTarget })

        const local = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (local && local !== timeZone) {
          void remote.setTimeZone(user.id, local).catch(() => {
            // Best-effort; the MCP server falls back to UTC without it.
          })
        }
      })
      .catch(() => {
        // Network/RLS failure — keep the cached localStorage value as-is.
      })
    return () => {
      active = false
    }
  }, [authLoading, remote, user])

  const update = useCallback(
    (patch: Partial<Settings>) => {
      // Write the cache + broadcast first so the UI updates immediately (the
      // `sync` listener picks it up). For authed users, also write through to
      // Supabase; failures leave the optimistic cache value in place.
      persist(patch)
      if (remote && user && patch.weeklyTarget !== undefined) {
        void remote.set(user.id, patch.weeklyTarget).catch(() => {
          // Swallow — cache already reflects the intended value.
        })
      }
    },
    [remote, user]
  )

  return { settings, update }
}
