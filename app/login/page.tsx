'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Provider = 'google' | 'github'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState<'google' | 'github' | 'magic' | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)

  async function signInWithProvider(provider: Provider) {
    setError(null)
    setPending(provider)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      setPending(null)
    }
    // On success the browser is redirected to the provider; no further work here.
  }

  async function sendMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending('magic')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    setPending(null)
    if (error) {
      setError(error.message)
      return
    }
    setSent(true)
  }

  function skipForNow() {
    // Persist guest mode as a cookie so proxy.ts (edge, cookies-only) lets the
    // user into the app without a session. Mirror to localStorage for client reads.
    document.cookie = `jobbery:mode=guest; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    localStorage.setItem('jobbery:mode', 'guest')
    router.push('/')
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col gap-1.5 text-center">
          <h1 className="font-mono text-xl font-semibold tracking-tight">
            <span className="text-muted-foreground">[</span>
            jobbery
            <span className="text-muted-foreground">]</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to sync your applications across devices.
          </p>
        </div>

        {sent ? (
          <div className="flex flex-col gap-2 rounded-lg border border-input bg-background p-4 text-center">
            <p className="text-sm font-medium">Check your email</p>
            <p className="text-sm text-muted-foreground">
              We sent a magic link to{' '}
              <span className="font-medium text-foreground">{email}</span>. Click
              it to sign in.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="w-full"
                loading={pending === 'google'}
                disabled={pending !== null}
                onClick={() => signInWithProvider('google')}
              >
                Continue with Google
              </Button>
              <Button
                variant="outline"
                className="w-full"
                loading={pending === 'github'}
                disabled={pending !== null}
                onClick={() => signInWithProvider('github')}
              >
                Continue with GitHub
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <form className="flex flex-col gap-2" onSubmit={sendMagicLink}>
              <Input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={pending !== null}
              />
              <Button
                type="submit"
                className="w-full"
                loading={pending === 'magic'}
                disabled={pending !== null || email.length === 0}
              >
                Send magic link
              </Button>
            </form>

            {error && (
              <p className="text-center text-sm text-destructive">{error}</p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={skipForNow}
          className="cursor-pointer text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip for now →
        </button>
      </div>
    </main>
  )
}
