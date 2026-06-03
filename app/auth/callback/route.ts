import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Shared callback for both auth flows:
//   - OAuth (Google/GitHub): Supabase redirects here with `?code=` → exchange it.
//   - Magic-link / email OTP: the email link carries `?token_hash=&type=` (the
//     template uses {{ .TokenHash }}) → verify it. exchangeCodeForSession does
//     NOT handle this; verifyOtp does.
// On success we send the user to `next` (sanitized) or the root.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  // Only allow same-origin relative redirects (must start with '/').
  const nextParam = searchParams.get('next')
  const next = nextParam?.startsWith('/') ? nextParam : '/'

  const supabase = await createClient()

  // OAuth code exchange.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Magic-link / email OTP verification. The link opens in a NEW tab (the email
  // client's doing), so on success we don't land the user here — we send them to
  // /auth/complete, which signals the original tab (via BroadcastChannel) to pick
  // up the now-set session cookie and then closes itself. `next` rides along so a
  // user who can't auto-close has a "continue here" target.
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      const complete = new URL('/auth/complete', origin)
      if (next !== '/') complete.searchParams.set('next', next)
      return NextResponse.redirect(complete)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
