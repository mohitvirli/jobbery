'use client'

// Client auth context. Seeds from getUser() on mount, then stays reactive via
// onAuthStateChange. Exposes { user, isGuest, loading } — the single source of
// truth for who's signed in (or whether the user chose guest mode). The hook in
// hooks/use-auth.ts reads this and derives effectiveUserId.

import {
  createContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { migrateLocalData } from '@/lib/migrate-local'

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

  // Guards the one-shot v0/guest migration so it fires at most once per mount,
  // no matter how many auth events arrive (getUser + onAuthStateChange both
  // resolve to a user). The migration itself is also idempotent via its own
  // per-user localStorage flag, so a second run across sessions is harmless;
  // this ref just avoids redundant work within a single session.
  const migrationTriggered = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    let active = true

    // Fire-and-forget so migration never blocks render. Runs only for a real
    // user (never guests, who have no user). Errors are logged, not thrown —
    // on failure migrateLocalData leaves its flag unset so the next login
    // retries.
    const runMigration = (signedInUser: User, client: SupabaseClient) => {
      if (migrationTriggered.current) return
      migrationTriggered.current = true
      void migrateLocalData(signedInUser.id, client).catch((err: unknown) => {
        console.error('[auth] local data migration failed', err)
      })
    }

    // Seed from the current session. loading stays true until this resolves so
    // consumers never read user.id prematurely.
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return
      if (data.user) {
        clearGuestMode()
        runMigration(data.user, supabase)
      }
      setUser(data.user)
      setLoading(false)
    })

    // Stay reactive: login, logout, token refresh all flow through here.
    // Supabase fires SIGNED_IN on every tab focus/visibility change with a
    // fresh session object. Bail when the user id hasn't actually changed so
    // the context value stays referentially stable and the tree doesn't
    // re-render (which caused a visible flash on tab focus).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      if (nextUser) {
        clearGuestMode()
        runMigration(nextUser, supabase)
      }
      setUser((prev) => {
        if (prev?.id === nextUser?.id) return prev
        return nextUser
      })
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
