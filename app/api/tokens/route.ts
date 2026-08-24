// GET  /api/tokens  → the signed-in user's tokens (never the plaintext)
// POST /api/tokens  → mint a new token; the ONLY time the plaintext is returned
//
// Cookie-authed via the SSR Supabase client, so RLS scopes every query to
// auth.uid(). No service key here — that's reserved for the MCP route, which
// has no session to key off.

import {
  generateToken,
  hashToken,
  prefixOf,
  toTokenSummary,
} from '@/lib/api-tokens'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs' // node:crypto in lib/api-tokens

const MAX_NAME_LEN = 60

export async function GET(): Promise<Response> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const { data, error } = await supabase
    .from('api_tokens')
    .select('id, name, prefix, created_at, last_used_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data.map(toTokenSummary))
}

export async function POST(req: Request): Promise<Response> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  let name = 'Claude'
  try {
    const body = (await req.json()) as { name?: unknown }
    if (typeof body.name === 'string' && body.name.trim()) {
      name = body.name.trim().slice(0, MAX_NAME_LEN)
    }
  } catch {
    // Empty/invalid body is fine — fall back to the default name.
  }

  const token = generateToken()
  const { data, error } = await supabase
    .from('api_tokens')
    .insert([
      {
        user_id: user.id,
        name,
        token_hash: hashToken(token),
        prefix: prefixOf(token),
      },
    ])
    .select('id, name, prefix, created_at, last_used_at')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // `token` appears in this response and nowhere else, ever.
  return Response.json({ ...toTokenSummary(data), token }, { status: 201 })
}
