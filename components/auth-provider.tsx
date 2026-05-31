'use client'

// Client auth context. Seeds from getUser() on mount, then stays reactive via
// onAuthStateChange. Exposes { user, isGuest, loading } — the single source of
// truth for who's signed in (or whether the user chose guest mode). The hook in
// hooks/use-auth.ts reads this and derives effectiveUserId.

import {
  createContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

export type AuthContextValue = {
  user: User | null
  isGuest: boolean
  loading: boolean
}

// Undefined sentinel lets the hook detect "used outside provider" vs a real
// null user.
export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
)

// Guest mode is persisted as a cookie (so proxy.ts can read it at the edge);
// localStorage is only a mirror. Here we read the cookie — it's the source of
// truth for guest detection on the client too.
function hasGuestCookie(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie
    .split(';')
    .some((c) => c.trim() === 'jobbery:mode=guest')
}

// Once a real user resolves, the guest choice is moot — clear both the cookie
// and its localStorage mirror so the proxy gate prefers the real session
// (plan P3.6 / P4.4).
function clearGuestMode(): void {
  if (typeof document !== 'undefined') {
    document.cookie = 'jobbery:mode=; path=/; max-age=0'
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('jobbery:mode')
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    let active = true

    // Seed from the current session. loading stays true until this resolves so
    // consumers never read user.id prematurely.
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return
      if (data.user) clearGuestMode()
      setUser(data.user)
      setLoading(false)
    })

    // Stay reactive: login, logout, token refresh all flow through here.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      if (nextUser) clearGuestMode()
      setUser(nextUser)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // Guest = not signed in AND the guest cookie is set. Recomputed each render;
  // cheap and always reflects the current cookie.
  const isGuest = user === null && hasGuestCookie()

  return (
    <AuthContext.Provider value={{ user, isGuest, loading }}>
      {children}
    </AuthContext.Provider>
  )
}
