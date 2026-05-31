'use client'

// "Log in to sync" CTA — visible ONLY in guest mode. Routes to /login, where a
// guest can sign in and have their local data migrated to the real account
// (Phase 8). Authed users (and the pre-auth loading window) render nothing.
//
// Lives next to <SettingsDialog /> in both headers (desktop in dashboard.tsx,
// mobile in app/(app)/layout.tsx) so it shows consistently across breakpoints.

import Link from 'next/link'
import { LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'

export function LoginCta() {
  const { isGuest } = useAuth()
  if (!isGuest) return null

  return (
    <Button
      variant="outline"
      size="sm"
      render={<Link href="/login" />}
      title="Log in to sync your data across devices"
    >
      <LogIn />
      Log in to sync
    </Button>
  )
}
