// SupabaseStore — implements the Storage interface against the Supabase
// `applications` table. Owns all snake_case ↔ camelCase mapping so nothing
// above this layer ever touches DB column names.
//
// Caller passes the browser supabase client (from lib/supabase/client.ts).
// RLS enforces user scoping at the DB; we ALSO pass .eq('user_id', userId)
// on every query as defense-in-depth and to get correct optimistic results.

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeStatus } from './status'
import type { Storage } from './storage'
import type { Application, ApplicationPatch, NewApplication } from './types'

// ---------------------------------------------------------------------------
// DB row type (snake_case). Keep in sync with the `applications` table schema.
// ---------------------------------------------------------------------------
interface ApplicationRow {
  id: string
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

// ---------------------------------------------------------------------------
// Mappers — single place where snake_case ↔ camelCase conversion lives.
// ---------------------------------------------------------------------------

function toApplication(row: ApplicationRow): Application {
  return {
    id: row.id,
    userId: row.user_id,
    company: row.company,
    role: row.role,
    url: row.url,
    note: row.note,
    // Older rows predate the column; the DB default covers new writes, but a
    // partially-selected or cached row could still surface null here.
    tags: row.tags ?? [],
    createdAt: row.created_at,
    appliedAt: row.applied_at,
    // Normalized, not cast: if the 0005 status migration hasn't been applied
    // yet the DB still holds 'interview'/'offer', and the app should read those
    // correctly rather than render an unknown status.
    status: normalizeStatus(row.status),
    updatedAt: row.updated_at,
  }
}

function toInsertRow(
  userId: string,
  input: NewApplication,
  now: string,
): Omit<ApplicationRow, 'id'> {
  return {
    user_id: userId,
    company: input.company,
    role: input.role ?? null,
    url: input.url ?? null,
    note: input.note ?? null,
    tags: input.tags ?? [],
    // Logged and submitted at the same instant on create; only appliedAt is
    // re-stamped later, when a queued row flips to 'applied'.
    created_at: now,
    applied_at: now,
    status: input.status ?? 'applied',
    updated_at: now,
  }
}

function toUpdateRow(patch: ApplicationPatch, now: string): Partial<ApplicationRow> {
  const row: Partial<ApplicationRow> = { updated_at: now }
  if ('company' in patch && patch.company !== undefined) row.company = patch.company
  if ('role' in patch) row.role = patch.role ?? null
  if ('url' in patch) row.url = patch.url ?? null
  if ('note' in patch) row.note = patch.note ?? null
  if ('tags' in patch) row.tags = patch.tags ?? []
  if ('status' in patch && patch.status !== undefined) row.status = patch.status
  if ('appliedAt' in patch && patch.appliedAt !== undefined) row.applied_at = patch.appliedAt
  return row
}

// ---------------------------------------------------------------------------
// SupabaseStore
// ---------------------------------------------------------------------------

export class SupabaseStore implements Storage {
  constructor(private readonly client: SupabaseClient) {}

  async list(userId: string): Promise<Application[]> {
    const { data, error } = await this.client
      .from('applications')
      .select('*')
      .eq('user_id', userId)
      // Timeline order is log order — created_at, not applied_at, so flipping
      // a row to 'applied' never moves it.
      .order('created_at', { ascending: false })

    if (error) throw new Error(`SupabaseStore.list failed: ${error.message}`)
    return (data as ApplicationRow[]).map(toApplication)
  }

  async add(userId: string, input: NewApplication): Promise<Application> {
    const now = new Date().toISOString()
    const row = toInsertRow(userId, input, now)

    const { data, error } = await this.client
      .from('applications')
      .insert([row])
      .select()
      .single()

    if (error) throw new Error(`SupabaseStore.add failed: ${error.message}`)
    return toApplication(data as ApplicationRow)
  }

  async update(userId: string, id: string, patch: ApplicationPatch): Promise<Application> {
    const now = new Date().toISOString()
    const row = toUpdateRow(patch, now)

    const { data, error } = await this.client
      .from('applications')
      .update(row)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw new Error(`SupabaseStore.update failed: ${error.message}`)
    return toApplication(data as ApplicationRow)
  }

  async remove(userId: string, id: string): Promise<void> {
    const { error } = await this.client
      .from('applications')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) throw new Error(`SupabaseStore.remove failed: ${error.message}`)
  }
}
