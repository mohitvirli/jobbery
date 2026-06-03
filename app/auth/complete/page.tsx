'use client'

// Landing page for the new tab a magic link opens. By the time we get here the
// callback route has already verified the OTP and set the session cookie (cookies
// are shared across same-origin tabs), so the *original* tab can sign in just by
// re-reading them. We:
//   1. broadcast "signed-in" so AuthProvider in the original tab re-checks auth,
//   2. try to close this tab — best effort, see note below,
//   3. render a fallback for when the close is blocked.
//
// Note: window.close() only works on windows opened by script (window.open).
// A tab the email client opened is browser-opened, so most browsers refuse to
// close it. Hence the fallback message + "continue here" link.

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function Complete() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/'
  // Same-origin redirects only, mirroring the callback route's sanitization.
  const target = next.startsWith('/') ? next : '/'
  const [canClose, setCanClose] = useState(true)

  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('jobbery:auth')
      channel.postMessage({ type: 'signed-in' })
      channel.close()
    }

    // Attempt to close. Blocked for browser-opened tabs — if we're still here
    // a moment later, surface the fallback instead of a frozen blank tab.
    window.close()
    const timer = setTimeout(() => setCanClose(false), 400)
    return () => clearTimeout(timer)
  }, [])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-medium">You&apos;re signed in.</p>
      <p className="text-sm text-muted-foreground">
        {canClose
          ? 'You can close this tab and return to the original.'
          : 'You can close this tab and return to where you started.'}
      </p>
      {!canClose && (
        <Link
          href={target}
          className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Or continue here →
        </Link>
      )}
    </main>
  )
}

export default function AuthCompletePage() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <Complete />
    </Suspense>
  )
}
