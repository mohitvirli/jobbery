// Per-user settings store, backed by the Supabase `user_settings` table.
// Only `weeklyTarget` lives here — theme stays device-local via next-themes.
//
// Owns all snake_case ↔ camelCase mapping (weekly_target ↔ weeklyTarget) so
// nothing above this layer touches DB column names. Mirrors the SupabaseStore
// shape: caller passes the browser supabase client; RLS scopes by user at the
// DB and we ALSO pass the userId explicitly as defense-in-depth.

import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_SETTINGS } from './settings'

// DB row (snake_case). Keep in sync with the `user_settings` table schema.
interface UserSettingsRow {
  user_id: string
  weekly_target: number
  updated_at: string
}

export class UserSettingsStore {
  constructor(private readonly client: SupabaseClient) {}

  // Read the user's weekly target. A missing row (never written) is not an
  // error — it just means "use the default".
  async get(userId: string): Promise<number> {
    const { data, error } = await this.client
      .from('user_settings')
      .select('weekly_target')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw new Error(`UserSettingsStore.get failed: ${error.message}`)
    if (!data) return DEFAULT_SETTINGS.weeklyTarget
    return (data as Pick<UserSettingsRow, 'weekly_target'>).weekly_target
  }

  // Write the user's weekly target. Upsert on the user_id PK so the first write
  // inserts and later writes update.
  async set(userId: string, weeklyTarget: number): Promise<void> {
    const row: UserSettingsRow = {
      user_id: userId,
      weekly_target: weeklyTarget,
      updated_at: new Date().toISOString(),
    }
    const { error } = await this.client
      .from('user_settings')
      .upsert(row, { onConflict: 'user_id' })

    if (error) throw new Error(`UserSettingsStore.set failed: ${error.message}`)
  }
}
