// Storage abstraction.
//
// v0 persists to localStorage. The `Storage` interface is the seam: swapping in
// Supabase later means writing one new class that implements this interface and
// changing the factory at the bottom — no caller touches storage internals.
//
// Every method takes `userId` even though v0 hardcodes 'local'. This keeps
// user-scoping in the data layer's signature from day one, so multi-user is an
// implementation detail later, not an API change.

import { normalizeStatus } from './status'
import type { Application, ApplicationPatch, NewApplication } from './types'

export interface Storage {
  list(userId: string): Promise<Application[]>
  add(userId: string, input: NewApplication): Promise<Application>
  update(userId: string, id: string, patch: ApplicationPatch): Promise<Application>
  remove(userId: string, id: string): Promise<void>
}

const STORAGE_KEY = 'job-tracker:applications'

// Generate a stable unique id. crypto.randomUUID is available in all modern
// browsers; we only run client-side in v0.
function genId(): string {
  return crypto.randomUUID()
}

// localStorage holds one flat array across all users. We filter by userId on
// read so the on-disk shape already matches a multi-user world — a Supabase
// `where user_id = ?` maps onto this 1:1.
export class LocalStorageStore implements Storage {
  private readAll(): Application[] {
    if (typeof window === 'undefined') return [] // SSR guard
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as Application[]
      // Backfill/repair fields written before the current shape:
      //  - createdAt: rows predating the log/submit split only carry appliedAt,
      //    and that value IS their log date.
      //  - tags: always an array above this layer, so callers never guard.
      return parsed.map((a) => ({
        ...a,
        createdAt: a.createdAt ?? a.appliedAt,
        tags: a.tags ?? [],
        // Rows saved under the old vocabulary still say 'interview'/'offer'.
        status: normalizeStatus(a.status),
      }))
    } catch {
      return []
    }
  }

  private writeAll(apps: Application[]): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(apps))
  }

  async list(userId: string): Promise<Application[]> {
    return this.readAll()
      .filter((a) => a.userId === userId)
      // Newest-first by LOG date — re-stamping appliedAt must not reorder.
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async add(userId: string, input: NewApplication): Promise<Application> {
    const now = new Date().toISOString()
    const app: Application = {
      id: genId(),
      userId,
      company: input.company,
      role: input.role ?? null,
      url: input.url ?? null,
      note: input.note ?? null,
      tags: input.tags ?? [],
      createdAt: now,
      appliedAt: now,
      status: input.status ?? 'applied', // default = logging a submission
      updatedAt: now,
    }
    const all = this.readAll()
    all.push(app)
    this.writeAll(all)
    return app
  }

  async update(
    userId: string,
    id: string,
    patch: ApplicationPatch
  ): Promise<Application> {
    const all = this.readAll()
    const idx = all.findIndex((a) => a.userId === userId && a.id === id)
    if (idx === -1) throw new Error(`Application ${id} not found`)
    // Store owns updatedAt; ignore any caller-supplied value.
    const updated: Application = {
      ...all[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    all[idx] = updated
    this.writeAll(all)
    return updated
  }

  async remove(userId: string, id: string): Promise<void> {
    const all = this.readAll().filter((a) => !(a.userId === userId && a.id === id))
    this.writeAll(all)
  }
}

// Single swap point. Replace this with `new SupabaseStore(...)` later.
export const storage: Storage = new LocalStorageStore()
