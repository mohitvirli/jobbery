'use client'

// Accessor for the auth context. Throws outside <AuthProvider> so a missing
// provider fails loudly instead of silently handing back a default.
//
// effectiveUserId is the id every data path keys on: a real uuid when authed,
// 'local' for guests (matching v0 data + the Phase 8 migration source). It is
// NEVER empty/undefined — an empty id would break cache keys and store queries.

import { useContext } from 'react'
import type { User } from '@supabase/supabase-js'
import { AuthContext } from '@/components/auth-provider'

export type UseAuthResult = {
  user: User | null
  isGuest: boolean
  loading: boolean
  effectiveUserId: string
}

export function useAuth(): UseAuthResult {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an <AuthProvider>')
  }

  const effectiveUserId = ctx.user?.id ?? 'local'

  return {
    user: ctx.user,
    isGuest: ctx.isGuest,
    loading: ctx.loading,
    effectiveUserId,
  }
}
