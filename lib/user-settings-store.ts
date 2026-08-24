// Per-user settings store, backed by the Supabase `user_settings` table.
// `weeklyTarget` and `timeZone` live here — theme stays device-local via
// next-themes.
//
// Owns all snake_case ↔ camelCase mapping (weekly_target ↔ weeklyTarget) so
// nothing above this layer touches DB column names. Mirrors the SupabaseStore
// shape: caller passes the browser supabase client; RLS scopes by user at the
// DB and we ALSO pass the userId explicitly as defense-in-depth.
//
// The MCP route passes the SERVICE client instead, which bypasses RLS — the
// explicit userId filter on every method is what keeps that safe. Do not add a
// query here without one.

import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_SETTINGS } from './settings'

// DB row (snake_case). Keep in sync with the `user_settings` table schema.
interface UserSettingsRow {
  user_id: string
  weekly_target: number
  time_zone: string | null
  updated_at: string
}

// What callers above this layer see. `timeZone` is null until a browser has
// reported one; consumers decide their own fallback (the UI uses local, the
// MCP server uses UTC).
export type RemoteSettings = {
  weeklyTarget: number
  timeZone: string | null
}

export class UserSettingsStore {
  constructor(private readonly client: SupabaseClient) {}

  // Read the user's settings. A missing row (never written) is not an error —
  // it just means "use the defaults".
  async get(userId: string): Promise<RemoteSettings> {
    const { data, error } = await this.client
      .from('user_settings')
      .select('weekly_target, time_zone')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw new Error(`UserSettingsStore.get failed: ${error.message}`)
    if (!data) {
      return { weeklyTarget: DEFAULT_SETTINGS.weeklyTarget, timeZone: null }
    }
    const row = data as Pick<UserSettingsRow, 'weekly_target' | 'time_zone'>
    return { weeklyTarget: row.weekly_target, timeZone: row.time_zone }
  }

  // Write the user's weekly target. Upsert on the user_id PK so the first write
  // inserts and later writes update. Only the listed columns are touched, so
  // this never clobbers time_zone.
  async set(userId: string, weeklyTarget: number): Promise<void> {
    const { error } = await this.client
      .from('user_settings')
      .upsert(
        { user_id: userId, weekly_target: weeklyTarget, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )

    if (error) throw new Error(`UserSettingsStore.set failed: ${error.message}`)
  }

  // Record the browser's IANA zone. Written by the app on load; read by the MCP
  // server, which runs in UTC and would otherwise bucket days on the wrong
  // boundary and report streaks that disagree with the dashboard.
  async setTimeZone(userId: string, timeZone: string): Promise<void> {
    const { error } = await this.client
      .from('user_settings')
      .upsert(
        { user_id: userId, time_zone: timeZone, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )

    if (error) {
      throw new Error(`UserSettingsStore.setTimeZone failed: ${error.message}`)
    }
  }
}
