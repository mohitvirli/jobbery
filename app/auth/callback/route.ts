import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Shared exchange endpoint for both OAuth (Google/GitHub) and magic-link.
// Supabase redirects here with a `code`; we swap it for a session, then send
// the user on to `next` (sanitized) or the root.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // Only allow same-origin relative redirects (must start with '/').
  const nextParam = searchParams.get('next')
  const next = nextParam?.startsWith('/') ? nextParam : '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
