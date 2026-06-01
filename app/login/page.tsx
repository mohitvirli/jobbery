'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoginPreview } from '@/components/login-preview'

type Provider = 'google' | 'github'

// Pragmatic email shape check — one @, a dot in the domain, no spaces. Not
// RFC-perfect (no client check is); blocks obvious typos before hitting the API.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim())

// Staggered entrance. The page container cascades its children; the auth-options
// block is itself a container so its rows cascade once it appears.
const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.08 } },
}
const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
}
const optionsGroup: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut', staggerChildren: 0.07, when: 'beforeChildren' },
  },
}
// Skip is a top-level container child, so the page stagger would land it ~0.24s —
// while the form rows inside optionsGroup are still cascading. Give it an explicit
// delay so it settles last, after the form and just before the preview cards.
const skipItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut', delay: 0.6 } },
}

// lucide dropped brand glyphs, so the provider marks are inline SVGs.
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <path d="M12 1A11 11 0 0 0 8.52 22.44c.55.1.75-.24.75-.53v-1.85c-3.06.67-3.71-1.47-3.71-1.47-.5-1.27-1.22-1.61-1.22-1.61-1-.68.08-.67.08-.67 1.1.08 1.68 1.13 1.68 1.13.98 1.68 2.57 1.2 3.2.92.1-.71.38-1.2.69-1.47-2.44-.28-5.01-1.22-5.01-5.43 0-1.2.43-2.18 1.13-2.95-.11-.28-.49-1.4.11-2.92 0 0 .92-.3 3.02 1.13a10.5 10.5 0 0 1 5.5 0c2.1-1.42 3.02-1.13 3.02-1.13.6 1.51.22 2.64.11 2.92.7.77 1.13 1.75 1.13 2.95 0 4.22-2.58 5.15-5.03 5.42.4.34.75 1 .75 2.03v3.01c0 .3.2.64.76.53A11 11 0 0 0 12 1Z" />
    </svg>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const reduce = useReducedMotion()
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
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.')
      return
    }
    setPending('magic')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
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
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6">
      <motion.div
        className="relative z-10 flex w-full max-w-sm flex-col gap-8"
        variants={container}
        initial={reduce ? false : 'hidden'}
        animate="visible"
      >
        <motion.div variants={item} className="flex flex-col gap-1.5 text-center">
          <h1 className="font-mono text-xl font-semibold tracking-tight">
            <span className="text-muted-foreground">[</span>
            jobbery
            <span className="text-muted-foreground">]</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to sync your applications across devices.
          </p>
        </motion.div>

        {sent ? (
          <motion.div
            variants={item}
            className="flex flex-col gap-2 rounded-lg border border-input bg-background p-4 text-center"
          >
            <p className="text-sm font-medium">Check your email</p>
            <p className="text-sm text-muted-foreground">
              We sent a magic link to{' '}
              <span className="font-medium text-foreground">{email}</span>. Click
              it to sign in.
            </p>
          </motion.div>
        ) : (
          <motion.div variants={optionsGroup} className="flex flex-col gap-4">
            <motion.div variants={item} className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                loading={pending === 'google'}
                disabled={pending !== null}
                onClick={() => signInWithProvider('google')}
              >
                Google
                <GoogleIcon />
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                loading={pending === 'github'}
                disabled={pending !== null}
                onClick={() => signInWithProvider('github')}
              >
                GitHub
                <GitHubIcon />
              </Button>
            </motion.div>

            <motion.div variants={item} className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <span className="h-px flex-1 bg-border" />
            </motion.div>

            <motion.form
              variants={item}
              className="flex items-center gap-2"
              onSubmit={sendMagicLink}
            >
              <Input
                type="email"
                required
                size="lg"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (error) setError(null)
                }}
                disabled={pending !== null}
                aria-invalid={email.length > 0 && !isValidEmail(email)}
                className="min-w-0 flex-1"
              />
              <Button
                type="submit"
                size="icon-lg"
                loading={pending === 'magic'}
                disabled={pending !== null || !isValidEmail(email)}
                aria-label="Send magic link"
                title="Send magic link"
              >
                <ArrowRight />
              </Button>
            </motion.form>

            {error && (
              <p className="text-center text-sm text-destructive">{error}</p>
            )}
          </motion.div>
        )}

        <motion.button
          variants={skipItem}
          type="button"
          onClick={skipForNow}
          className="cursor-pointer text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip for now →
        </motion.button>
      </motion.div>

      <LoginPreview />
    </main>
  )
}
