import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

// Service-role Supabase client. SERVER-ONLY — never import this into a
// 'use client' file, and never expose SUPABASE_SECRET_KEY through a
// NEXT_PUBLIC_ var.
//
// Used by exactly one caller: the MCP route (app/api/mcp/route.ts). MCP clients
// authenticate with a personal access token, not a Supabase session, so there's
// no auth.uid() for RLS to key off — the route resolves the token to a userId
// itself and then queries with this client.
//
// SECURITY: this key BYPASSES row-level security. Every query made through it
// MUST carry an explicit `.eq('user_id', userId)`. SupabaseStore and
// UserSettingsStore already do this on every method as defense-in-depth (see
// their header comments); with this client that property is load-bearing, so
// any new query added to those classes has to keep it.
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase service client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY'
    )
  }
  return createSupabaseClient(url, key, {
    // No cookies, no session to persist or refresh — this client is stateless
    // and per-request.
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
