// One-shot migration of v0 / guest local data into Supabase.
//
// Both the original v0 user and a guest who later logs in store their data
// under userId 'local'. On the first authenticated load we move those local
// rows into Supabase under the real user id, exactly once.
//
// IDEMPOTENCY (the single most important property):
//   A per-user flag `jobbery:migrated:<userId>` in localStorage gates the run.
//   It is set ONLY after every insert succeeds. If any insert fails we leave
//   the flag unset AND leave the local sources intact, so the next login
//   retries cleanly. A double-run can therefore never duplicate rows: either
//   the flag is set (we bail immediately) or the previous run never completed
//   (and never cleared its sources, so re-running migrates the same rows once).
//
// PRESERVING appliedAt:
//   SupabaseStore.add stamps applied_at = now, which would destroy the real
//   submission dates the heatmap/streak depend on. So this module inserts
//   directly via the supabase client with applied_at/updated_at carried over
//   from the local rows, rather than going through SupabaseStore.add.

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeStatus } from './status'
import type { Application } from './types'
import { UserSettingsStore } from './user-settings-store'
import { DEFAULT_SETTINGS } from './settings'

// v0 flat array of all applications (filtered by userId at read time).
const V0_APPLICATIONS_KEY = 'job-tracker:applications'
// Guest cache key written by CachedStore for userId 'local'.
const GUEST_CACHE_KEY = 'jobbery:applications:local'
// v0 settings (weeklyTarget).
const V0_SETTINGS_KEY = 'job-tracker:settings'

// The userId all local/guest data is scoped under.
const LOCAL_USER_ID = 'local'

function migratedFlagKey(userId: string): string {
  return `jobbery:migrated:${userId}`
}

// DB insert row (snake_case). Mirrors the `applications` table; carries the
// original applied_at/updated_at so dates are preserved.
interface ApplicationInsertRow {
  user_id: string
  company: string
  role: string | null
  url: string | null
  note: string | null
  tags: string[]
  created_at: string
  applied_at: string
  status: string
  updated_at: string
}

// Safely parse a localStorage JSON array of Applications.
function readApplications(key: string): Application[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(key)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed as Application[]
  } catch {
    return []
  }
}

// Read the local weeklyTarget, or null if unset/default/unparseable.
function readLocalWeeklyTarget(): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(V0_SETTINGS_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { weeklyTarget?: unknown }
    const target = parsed.weeklyTarget
    if (typeof target !== 'number' || !Number.isFinite(target)) return null
    return target
  } catch {
    return null
  }
}

// Gather local rows from BOTH sources, deduped by id. The v0 flat array holds
// all users so we filter to userId 'local'; the guest cache key is already
// scoped to 'local'.
function gatherLocalRows(): Application[] {
  const v0Rows = readApplications(V0_APPLICATIONS_KEY).filter(
    (a) => a.userId === LOCAL_USER_ID,
  )
  const guestRows = readApplications(GUEST_CACHE_KEY)

  const byId = new Map<string, Application>()
  for (const row of [...v0Rows, ...guestRows]) {
    // Skip optimistic placeholders that never reconciled with a real row.
    if (row.id.startsWith('optimistic:')) continue
    if (!byId.has(row.id)) byId.set(row.id, row)
  }
  return [...byId.values()]
}

// Remove the migrated local sources so guest data doesn't linger or
// double-count. Called ONLY after a successful migration.
function clearLocalSources(): void {
  if (typeof window === 'undefined') return

  // Guest cache key: delete entirely (scoped to 'local').
  window.localStorage.removeItem(GUEST_CACHE_KEY)

  // v0 flat array: strip only the 'local' rows, preserving any others.
  const remaining = readApplications(V0_APPLICATIONS_KEY).filter(
    (a) => a.userId !== LOCAL_USER_ID,
  )
  if (remaining.length > 0) {
    window.localStorage.setItem(V0_APPLICATIONS_KEY, JSON.stringify(remaining))
  } else {
    window.localStorage.removeItem(V0_APPLICATIONS_KEY)
  }
}

/**
 * Migrate v0/guest local data into Supabase under `userId`, exactly once.
 *
 * Idempotent via the `jobbery:migrated:<userId>` flag, which is set only after
 * all inserts succeed. On any failure the flag stays unset and local sources
 * stay intact, so the next login retries.
 */
export async function migrateLocalData(
  userId: string,
  supabaseClient: SupabaseClient,
): Promise<void> {
  if (typeof window === 'undefined') return
  // Never migrate into the guest id itself.
  if (userId === LOCAL_USER_ID) return

  const flagKey = migratedFlagKey(userId)

  // Guard: already migrated for this user — re-login never re-runs.
  if (window.localStorage.getItem(flagKey) !== null) return

  const rows = gatherLocalRows()
  const localWeeklyTarget = readLocalWeeklyTarget()
  const hasNonDefaultTarget =
    localWeeklyTarget !== null &&
    localWeeklyTarget !== DEFAULT_SETTINGS.weeklyTarget

  // Nothing to migrate: still set the flag so we don't re-scan every login.
  if (rows.length === 0 && !hasNonDefaultTarget) {
    window.localStorage.setItem(flagKey, new Date().toISOString())
    return
  }

  // ORDERING: settings (idempotent upsert) BEFORE applications (non-idempotent
  // insert). If applications fails, the flag stays unset and we retry next
  // login; the settings upsert having already run is harmless (re-upserting
  // the same value is a no-op). This guarantees the non-idempotent step is the
  // LAST thing before the flag, so a mid-way failure can never leave duplicate
  // applications behind.

  // 1) weeklyTarget — only when a non-default value exists.
  if (hasNonDefaultTarget && localWeeklyTarget !== null) {
    const settingsStore = new UserSettingsStore(supabaseClient)
    // Throws on failure → flag stays unset → retried next login.
    await settingsStore.set(userId, localWeeklyTarget)
  }

  // 2) Applications — single batched insert preserving original dates.
  //    Going direct (not SupabaseStore.add) so applied_at/updated_at carry
  //    over instead of being stamped to now.
  if (rows.length > 0) {
    const insertRows: ApplicationInsertRow[] = rows.map((r) => ({
      user_id: userId,
      company: r.company,
      role: r.role ?? null,
      url: r.url ?? null,
      note: r.note ?? null,
      tags: r.tags ?? [],
      created_at: r.createdAt ?? r.appliedAt,
      applied_at: r.appliedAt,
      status: normalizeStatus(r.status),
      updated_at: r.updatedAt ?? r.appliedAt,
    }))

    const { error } = await supabaseClient
      .from('applications')
      .insert(insertRows)

    if (error) {
      // Do NOT set the flag or clear sources — retry on next login.
      throw new Error(`migrateLocalData: applications insert failed: ${error.message}`)
    }
  }

  // 3) SUCCESS — set the flag, then clear the local sources.
  window.localStorage.setItem(flagKey, new Date().toISOString())
  clearLocalSources()
}
