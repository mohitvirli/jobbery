import { createBrowserClient } from '@supabase/ssr'

// Browser Supabase client. No cookie config here — @supabase/ssr's
// createBrowserClient reads/writes cookies via document.cookie itself.
// Uses the publishable key (the 2nd-arg position the older anon key occupied).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
