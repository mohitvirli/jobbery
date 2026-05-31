import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Next.js 16 uses proxy.ts (the former middleware.ts). This refreshes the
// Supabase auth token on every matched request and gates the (app) group.
//
// Cookie getAll/setAll pattern adapted from the Supabase docs:
// https://supabase.com/docs/guides/auth/server-side/nextjs
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Refresh the token. Use getClaims() — NOT getSession()/getUser() — for the
  // protection gate: getClaims revalidates the token, getSession does not.
  const { data } = await supabase.auth.getClaims()

  // Guest mode: proxy runs at the edge and can only read cookies (not
  // localStorage), so the "skip login" choice is persisted as a cookie.
  const isGuest = request.cookies.get('jobbery:mode')?.value === 'guest'

  // Three-way gate: valid claims → in (token refreshed above); else guest
  // cookie → in; else → /login.
  if (!data?.claims && !isGuest) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  // Match all request paths except the ones that must stay public or are
  // static assets. /login and /auth (the OAuth/magic-link callback) MUST be
  // excluded or the redirect round-trip loops.
  matcher: [
    '/((?!login|auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
