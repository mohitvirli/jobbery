// Personal access tokens — the credential an MCP client sends as
// `Authorization: Bearer <token>` to act as a jobbery user.
//
// Only the sha256 hash is persisted. The plaintext is returned once, at
// creation, and is unrecoverable after that; a lost token gets revoked and
// replaced. Node-only (node:crypto) — server routes only.
//
// Lookup is by hash, which is why the hash column is unique-indexed: token
// verification is a single indexed point read on every MCP request.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const TOKEN_PREFIX = 'jbry_'
const PREFIX_DISPLAY_LEN = 12 // 'jbry_' + 7 chars — enough to tell tokens apart

// 32 random bytes, base64url. ~256 bits of entropy; not guessable.
export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// The shown-in-the-UI fragment of a token, so a user can tell which row is which.
export function prefixOf(token: string): string {
  return token.slice(0, PREFIX_DISPLAY_LEN)
}

// Shape returned to the settings UI. Never includes the hash.
export type ApiTokenSummary = {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
}

export function toTokenSummary(row: {
  id: string
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
}): ApiTokenSummary {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }
}

// Resolve a bearer token to its owner. Returns null for anything unrecognized —
// callers must treat null as 401 and must never fall back to a default user.
//
// Takes the SERVICE client: this runs before any Supabase session exists, so
// RLS can't scope the lookup.
export async function verifyToken(
  service: SupabaseClient,
  token: string
): Promise<{ userId: string; tokenId: string } | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null

  const hash = hashToken(token)
  const { data, error } = await service
    .from('api_tokens')
    .select('id, user_id, token_hash')
    .eq('token_hash', hash)
    .maybeSingle()

  if (error || !data) return null

  // The .eq above already did the comparison in Postgres; this is belt-and-braces
  // against a future refactor that fetches by prefix and compares in JS.
  const a = Buffer.from(data.token_hash as string)
  const b = Buffer.from(hash)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  // Fire-and-forget: a "last used" stamp is not worth delaying the request, and
  // a failed write must not fail the call.
  void service
    .from('api_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => undefined)

  return { userId: data.user_id as string, tokenId: data.id as string }
}
