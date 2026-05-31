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

  // Magic-link / email OTP verification.
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
