'use client'

// React binding over the storage layer. Components never touch `storage`
// directly — they use this hook, so the storage swap (localStorage → Supabase)
// stays invisible above this line. userId is hardcoded 'local' for v0; when auth
// lands it comes from the session instead.

import { useCallback, useEffect, useState } from 'react'
import { storage } from '@/lib/storage'
import type {
  Application,
  ApplicationPatch,
  ApplicationStatus,
  NewApplication,
} from '@/lib/types'

const USER_ID = 'local' // v0: single local user

export function useApplications() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const list = await storage.list(USER_ID)
    setApplications(list)
  }, [])

  useEffect(() => {
    // localStorage read is sync but storage API is async (Supabase-ready),
    // so we await and clear loading once hydrated client-side. setState lands
    // in the async .finally callback, not the effect body — safe by intent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const add = useCallback(
    async (input: NewApplication) => {
      const created = await storage.add(USER_ID, input)
      // Optimistic prepend (list is newest-first) — avoids a full re-read.
      setApplications((prev) => [created, ...prev])
      return created
    },
    []
  )

  const update = useCallback(
    async (id: string, patch: ApplicationPatch) => {
      const updated = await storage.update(USER_ID, id, patch)
      setApplications((prev) => {
        const next = prev.map((a) => (a.id === id ? updated : a))
        // Keep newest-first ordering since appliedAt can change on status flip.
        return next.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))
      })
      return updated
    },
    []
  )

  // Status transition helper. Flipping → 'applied' re-stamps appliedAt to NOW so
  // the heatmap/streak credit the day you actually applied (per product choice).
  const setStatus = useCallback(
    (id: string, status: ApplicationStatus) => {
      const patch: ApplicationPatch = { status }
      if (status === 'applied') patch.appliedAt = new Date().toISOString()
      return update(id, patch)
    },
    [update]
  )

  const remove = useCallback(async (id: string) => {
    await storage.remove(USER_ID, id)
    setApplications((prev) => prev.filter((a) => a.id !== id))
  }, [])

  return { applications, loading, add, update, setStatus, remove, refresh }
}
