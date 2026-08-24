'use client'

// React binding over the storage layer. Components never touch a store
// directly — they use this hook, so the storage swap stays invisible above this
// line. The store is now chosen per auth mode and userId comes from the session
// (see useAuth) instead of a hardcoded constant.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { CachedStore } from '@/lib/cached-store'
import { LocalStorageStore, type Storage } from '@/lib/storage'
import { SupabaseStore } from '@/lib/supabase-store'
import { createClient } from '@/lib/supabase/client'
import type {
  Application,
  ApplicationPatch,
  ApplicationStatus,
  NewApplication,
} from '@/lib/types'

export function useApplications() {
  const { user, loading: authLoading, effectiveUserId } = useAuth()

  // Pick the store by mode. Memoized on [user, effectiveUserId] so a single
  // store instance is reused across renders until the auth user changes.
  //   - No real user (guest OR logged-out): LocalStorageStore ONLY. effectiveUserId
  //     is 'local', which is not a uuid — Supabase would reject it. Keying off the
  //     real `user` (not isGuest) covers the post-logout window too, where there's
  //     no user AND no guest cookie yet.
  //   - Authed: CachedStore(SupabaseStore, LocalStorageStore) — remote is
  //     authoritative, localStorage is a read-through/write-through cache.
  const store = useMemo<Storage>(() => {
    if (!user) return new LocalStorageStore()
    return new CachedStore(new SupabaseStore(createClient()), new LocalStorageStore())
    // effectiveUserId is in the dep list so a user switch rebuilds the store
    // even if it stays authed (e.g. account A → account B).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, effectiveUserId])

  // Seed authed renders synchronously from the per-user cache for instant paint;
  // refresh() reconciles against the remote right after. Guests start empty and
  // hydrate in the effect (LocalStorageStore can't read sync from this layer).
  const [applications, setApplications] = useState<Application[]>(() => {
    if (store instanceof CachedStore) return store.cachedList(effectiveUserId)
    return []
  })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const list = await store.list(effectiveUserId)
    setApplications(list)
  }, [store, effectiveUserId])

  // Don't fetch until auth resolves — before that there's no real userId and a
  // guest/authed decision hasn't been made. Once authLoading is false we load
  // once and clear `loading` only after the first read resolves.
  const loadedFor = useRef<string | null>(null)
  useEffect(() => {
    if (authLoading) return
    // Re-run on store/user change (account switch, guest→authed).
    setLoading(true)
    loadedFor.current = effectiveUserId
    // setState lands in the async .finally callback, not the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().finally(() => setLoading(false))
  }, [authLoading, refresh, effectiveUserId])

  const add = useCallback(
    async (input: NewApplication) => {
      const created = await store.add(effectiveUserId, input)
      // Optimistic prepend (list is newest-first) — avoids a full re-read.
      setApplications((prev) => [created, ...prev])
      return created
    },
    [store, effectiveUserId]
  )

  const update = useCallback(
    async (id: string, patch: ApplicationPatch) => {
      const updated = await store.update(effectiveUserId, id, patch)
      // Swap in place — no re-sort needed. Ordering is by createdAt, which no
      // patch touches, so a re-read would produce the same order anyway.
      setApplications((prev) => prev.map((a) => (a.id === id ? updated : a)))
      return updated
    },
    [store, effectiveUserId]
  )

  // Status transition helper. Marking 'applied' re-stamps appliedAt to now so
  // the heatmap/streak credit the day you actually applied; moving back to
  // 'to_apply' leaves the date untouched (it's just re-queued, not un-applied).
  // createdAt is never patched, so the row stays in its original timeline group
  // and simply starts showing the applied date instead of a relative time.
  const setStatus = useCallback(
    (id: string, status: ApplicationStatus) =>
      update(
        id,
        status === 'applied'
          ? { status, appliedAt: new Date().toISOString() }
          : { status }
      ),
    [update]
  )

  const remove = useCallback(
    async (id: string) => {
      await store.remove(effectiveUserId, id)
      setApplications((prev) => prev.filter((a) => a.id !== id))
    },
    [store, effectiveUserId]
  )

  return { applications, loading, add, update, setStatus, remove, refresh }
}
