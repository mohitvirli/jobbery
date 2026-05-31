// CachedStore — wraps a remote Storage with a per-user localStorage cache.
//
// CACHE KEY STRATEGY
// ------------------
// We use a dedicated per-user key:  jobbery:applications:<userId>
//
// Why NOT reuse LocalStorageStore (key 'job-tracker:applications'):
//   1. LocalStorageStore stores ALL users in one flat array and filters by
//      userId at read time. That key must stay intact for Phase 8 migration
//      to find v0 / guest rows under userId='local'. Touching or overwriting
//      it here would break migration.
//   2. Per-user isolation is cleaner: clearing or refreshing one user's cache
//      doesn't touch another's.
//
// So CachedStore writes its own separate key per user and leaves the old
// 'job-tracker:applications' key alone.

import type { Storage } from './storage'
import type { Application, ApplicationPatch, NewApplication } from './types'

// Key prefix for CachedStore's per-user cache entries.
const CACHE_KEY_PREFIX = 'jobbery:applications:'

function cacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}${userId}`
}

// ---------------------------------------------------------------------------
// Internal helpers for the per-user localStorage cache
// ---------------------------------------------------------------------------

function readCache(userId: string): Application[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(cacheKey(userId))
  if (!raw) return []
  try {
    return JSON.parse(raw) as Application[]
  } catch {
    return []
  }
}

function writeCache(userId: string, apps: Application[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(cacheKey(userId), JSON.stringify(apps))
}

// ---------------------------------------------------------------------------
// CachedStore
// ---------------------------------------------------------------------------

export class CachedStore implements Storage {
  constructor(
    private readonly remote: Storage,
    private readonly cache: Storage,
  ) {}

  // Returns the cached list synchronously (no network). The hook can call this
  // to paint the UI instantly before the async list() resolves. This is NOT
  // part of the Storage interface — it's an extra public method for Phase 7.
  cachedList(userId: string): Application[] {
    return readCache(userId)
  }

  // list: fetch from remote (authoritative), overwrite cache on success,
  // fall back to cache on remote failure. Last-write-wins = remote wins.
  async list(userId: string): Promise<Application[]> {
    try {
      const apps = await this.remote.list(userId)
      // Remote is authoritative — overwrite cache.
      writeCache(userId, apps)
      return apps
    } catch (remoteErr) {
      // Network/RLS failure — serve stale cache rather than crashing.
      const cached = readCache(userId)
      if (cached.length > 0) return cached
      throw remoteErr
    }
  }

  // add: optimistic cache write, then remote; roll back on remote failure.
  async add(userId: string, input: NewApplication): Promise<Application> {
    // Take a snapshot of the current cache for rollback.
    const snapshot = readCache(userId)

    // Optimistic: write a temporary entry so the UI sees it immediately.
    // We'll replace it with the real DB-returned entry after remote resolves.
    const optimisticId = `optimistic:${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const optimistic: Application = {
      id: optimisticId,
      userId,
      company: input.company,
      role: input.role ?? null,
      url: input.url ?? null,
      note: input.note ?? null,
      appliedAt: now,
      status: input.status ?? 'applied',
      updatedAt: now,
    }
    writeCache(userId, [optimistic, ...snapshot])

    try {
      const added = await this.remote.add(userId, input)
      // Replace the optimistic entry with the real one.
      const current = readCache(userId)
      writeCache(
        userId,
        current.map((a) => (a.id === optimisticId ? added : a)),
      )
      return added
    } catch (err) {
      // Roll back to pre-op state.
      writeCache(userId, snapshot)
      throw err
    }
  }

  // update: optimistic patch in cache, then remote; roll back on failure.
  async update(userId: string, id: string, patch: ApplicationPatch): Promise<Application> {
    const snapshot = readCache(userId)

    // Optimistically apply the patch in cache.
    const now = new Date().toISOString()
    writeCache(
      userId,
      snapshot.map((a) =>
        a.id === id ? { ...a, ...patch, updatedAt: now } : a,
      ),
    )

    try {
      const updated = await this.remote.update(userId, id, patch)
      // Overwrite with the real DB-returned value (remote is authoritative).
      const current = readCache(userId)
      writeCache(
        userId,
        current.map((a) => (a.id === id ? updated : a)),
      )
      return updated
    } catch (err) {
      writeCache(userId, snapshot)
      throw err
    }
  }

  // remove: optimistic delete in cache, then remote; roll back on failure.
  async remove(userId: string, id: string): Promise<void> {
    const snapshot = readCache(userId)
    writeCache(
      userId,
      snapshot.filter((a) => a.id !== id),
    )

    try {
      await this.remote.remove(userId, id)
    } catch (err) {
      writeCache(userId, snapshot)
      throw err
    }
  }
}
