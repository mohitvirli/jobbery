# Plan: Supabase Auth (Google + GitHub + Magic-Link) + User-Scoped Data

**Goal:** Add Supabase auth to jobbery — Google OAuth, GitHub OAuth, and
passwordless email magic-link. **No email+password** (magic-link is
passwordless: no password stored, no password column, no password UI). Scope all
data per-user. Keep localStorage as a read-through/write-through cache
(last-write-wins). Sync weekly target per-user. Migrate v0 local data on first
login. **No SSR data fetch** — data loads client-side through the existing
`useApplications` hook. RLS enforces scoping at the DB.

**Guest mode (skip login):** Auth is OPTIONAL. A user can click "Skip for now"
and use the app immediately, localStorage-only, under the existing
`userId = 'local'`. The skip choice is persisted as a **cookie**
(`jobbery:mode=guest`) — not just localStorage — because `proxy.ts` runs at the
edge and can only read cookies, not localStorage. A guest can log in later from a
"Log in to sync" CTA; their local data migrates to the real user (Phase 8). The
proxy gate allows: valid session → in (refreshed); else guest cookie → in
(guest); else → `/login`.

**Stack:** Next.js 16.2.6, React 19.2, `@supabase/supabase-js`, `@supabase/ssr`.

---

## Phase 0 — Documentation Discovery (facts, already gathered)

### Allowed APIs (verified against Supabase docs)

| API | Signature / usage | Source |
|---|---|---|
| `createBrowserClient(url, key)` | `@supabase/ssr`. Singleton, browser. No cookie config. | supabase.com/docs/guides/auth/server-side/nextjs |
| `createServerClient(url, key, { cookies: { getAll, setAll } })` | `@supabase/ssr`. Route handlers + proxy only. | same |
| `supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })` | `provider: 'google' \| 'github'`. `redirectTo` must be in Supabase redirect allow-list. | auth/social-login/auth-google |
| `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })` | Passwordless magic-link. Mails a one-time link → `/auth/callback`. NO password. | auth/auth-email-passwordless |
| `supabase.auth.exchangeCodeForSession(code)` | In `/auth/callback` route handler. Same exchange for OAuth and magic-link. | same |
| `supabase.auth.getClaims()` | Proxy session refresh + protection. **Use this, NOT `getSession()`** — getSession isn't guaranteed to revalidate the token. | server-side/nextjs |
| `supabase.auth.onAuthStateChange((event, session) => …)` | Client subscription for reactive user state. | supabase-js |
| `supabase.auth.getUser()` | Client-side, returns authenticated user. OK in browser. | supabase-js |
| `supabase.auth.signOut()` | Sign out. | supabase-js |
| `supabase.from('applications').select/insert/update/delete()` | Data ops, `.eq('user_id', id)`. | supabase-js |

### Env vars (confirmed available)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — **this is the key to use** (user confirmed). Passed as the 2nd arg to `createBrowserClient`/`createServerClient` (same position the older `ANON_KEY` occupied). Do NOT reference `NEXT_PUBLIC_SUPABASE_ANON_KEY` anywhere.

### Anti-patterns to AVOID
- ❌ `createMiddlewareClient` / `createClientComponentClient` from `@supabase/auth-helpers-nextjs` — **deprecated**. Use `@supabase/ssr`.
- ❌ `getSession()` for auth protection in proxy/server — use `getClaims()`.
- ❌ `middleware.ts` — Next.js 16 uses **`proxy.ts`** at repo root.
- ❌ Trusting client-passed `userId` for security — RLS is the real guard.
- ❌ Inventing a Supabase `upsertMany` — use `.insert([...])` with an array.

### Existing seams (verified by reading the codebase)
- `lib/storage.ts` — `Storage` interface (4 methods, all take `userId`, all async). Singleton export at line 98 (`export const storage: Storage = new LocalStorageStore()`). **This is the swap point.**
- `hooks/use-applications.ts` line 17 — `const USER_ID = 'local'`. **This is where session userId plugs in.**
- `lib/settings.ts` — localStorage settings (`weeklyTarget`), key `job-tracker:settings`, broadcasts `SETTINGS_EVENT`. Consumed via a `use-settings` hook by `settings-dialog.tsx` + `stats-row.tsx`.
- `lib/types.ts` — `Application.userId: string`, comment says `'local' in v0`. Status/updatedAt already exist.
- `components/dashboard.tsx` — client component, `useApplications()`, shows `<Skeleton>` while `loading`.
- `app/(app)/page.tsx` — thin server entry → `<Dashboard/>`. `app/(app)/layout.tsx` wraps the app group.
- Old localStorage keys: `job-tracker:applications`, `job-tracker:settings`.

---

## Phase 1 — Supabase project + schema + RLS

**What to do (copy SQL exactly):**

1. Provision Supabase via Vercel Marketplace. Pull env with `vercel env pull` (or copy into `.env.local`). Confirm `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` present.
2. Install deps: `npm i @supabase/supabase-js @supabase/ssr`.
3. In Supabase SQL editor, create the table mirroring `lib/types.ts`:

```sql
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company text not null,
  role text,
  url text,
  note text,
  applied_at timestamptz not null,
  status text not null default 'applied',
  updated_at timestamptz not null default now()
);
create index applications_user_applied_idx
  on public.applications (user_id, applied_at desc);

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  weekly_target int not null default 5,
  updated_at timestamptz not null default now()
);
```

4. Enable RLS + policies (the user-scope guard):

```sql
alter table public.applications enable row level security;
create policy "own applications" on public.applications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.user_settings enable row level security;
create policy "own settings" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

5. In Supabase dashboard → Auth → Providers, enable **Google** and **GitHub**; paste OAuth client id/secret for each. Enable the **Email** provider (magic-link / OTP). Add redirect URLs (Phase 3) to the allow-list.

**Verification:**
- `select * from pg_policies where tablename in ('applications','user_settings');` → 2 rows.
- A query without a session returns 0 rows (RLS denies anon).
- `npm ls @supabase/ssr @supabase/supabase-js` resolves.

**Anti-pattern guard:** column names are snake_case in DB; the store maps to camelCase `Application`. Don't leak snake_case above the store.

---

## Phase 2 — Supabase clients

**What to do (copy from docs/guides/auth/server-side/nextjs):**

1. `lib/supabase/client.ts` — browser singleton:
```ts
import { createBrowserClient } from '@supabase/ssr'
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
```
2. `lib/supabase/server.ts` — server client (only used by the `/auth/callback` route handler + proxy), using `next/headers` `cookies()` with `getAll`/`setAll`. Copy the exact cookies block from the doc.

**Verification:**
- `grep -r "auth-helpers" .` → no matches (not using deprecated pkg).
- Both files import from `@supabase/ssr`.

**Anti-pattern guard:** do NOT add cookie config to the browser client. Do NOT import `server.ts` into a `'use client'` file.

---

## Phase 3 — proxy.ts + auth callback + login route

**What to do:**

1. Root `proxy.ts` (Next 16 name): create server client, call `supabase.auth.getClaims()` to refresh token, set cookies on request+response. **Three-way gate** for the `(app)` group:
   ```ts
   const { data } = await supabase.auth.getClaims()
   const isGuest = request.cookies.get('jobbery:mode')?.value === 'guest'
   if (!data?.claims && !isGuest) {
     return NextResponse.redirect(new URL('/login', request.url))
   }
   // else: allow through (authed → cookies already refreshed above; guest → no refresh needed)
   ```
   Copy the session-refresh pattern from the doc; swap `getUser`/`getSession` for `getClaims`. Add a `matcher` excluding `/login`, `/auth`, static assets.
2. `app/auth/callback/route.ts` — copy doc's GET handler: read `code`, `exchangeCodeForSession(code)`, redirect to `/` on success else `/login?error=auth`.
3. `app/login/page.tsx` — three options: Google button, GitHub button, magic-link email form. All call the browser client:
```ts
const supabase = createClient()

// OAuth (Google / GitHub)
await supabase.auth.signInWithOAuth({
  provider, // 'google' | 'github'
  options: { redirectTo: `${location.origin}/auth/callback` },
})

// Magic-link (passwordless — email only, no password field)
await supabase.auth.signInWithOtp({
  email,
  options: { emailRedirectTo: `${location.origin}/auth/callback` },
})
// → show "check your email" confirmation state; no redirect happens here.
```
   Plus a **"Skip for now →"** link/button:
```ts
// Set a long-lived guest cookie so proxy lets the user into (app) without auth.
// Cookie (not just localStorage) because proxy.ts reads cookies at the edge.
document.cookie = `jobbery:mode=guest; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
// (mirror to localStorage too if any client code wants a sync read)
localStorage.setItem('jobbery:mode', 'guest')
router.push('/')
```
4. Add `redirectTo`/`emailRedirectTo` URLs (local + prod) to Supabase redirect allow-list and each OAuth app's authorized redirect.
5. Supabase dashboard → Auth → Email: ensure email provider enabled (magic-link uses it). Default Supabase SMTP works for dev; configure custom SMTP for prod deliverability. Customize the magic-link email template if desired.
6. On successful login (OAuth or magic-link), the `/auth/callback` handler (or AuthProvider post-login) must **clear** the guest cookie so the gate prefers the real session: `document.cookie = 'jobbery:mode=; path=/; max-age=0'` (and remove the localStorage mirror). Do this client-side once `user` resolves.

**Verification:**
- Visiting `(app)` while logged out AND no guest cookie → redirected to `/login`.
- Clicking Google/GitHub → provider consent → back to `/` authenticated.
- Magic-link: submit email → "check email" state → click emailed link → `/auth/callback` → `/` authenticated. No password ever requested.
- "Skip for now" → cookie `jobbery:mode=guest` set → land on `/` in guest mode → reload stays in (no nag).
- Guest logs in later → guest cookie cleared → authed session takes over → local data migrated (P8).
- `proxy.ts` greps for `getClaims`, not `getSession`.

**Anti-pattern guard:** `proxy.ts` not `middleware.ts`. Matcher must exclude `/auth/callback` or the round-trip loops. Magic-link is `signInWithOtp` — do NOT add `signUp`/`signInWithPassword` (that would introduce passwords, which we explicitly don't want). Guest cookie MUST be cleared on login or the gate may keep treating an authed user as guest.

---

## Phase 4 — Auth context (client userId source)

**What to do:**

1. `components/auth-provider.tsx` (`'use client'`) — on mount `getUser()`, subscribe `onAuthStateChange`, expose `{ user, isGuest, loading }` via context. `isGuest` = no `user` AND `jobbery:mode=guest` cookie present. Unsubscribe on cleanup.
2. Wrap `app/(app)/layout.tsx` children in `<AuthProvider>`.
3. `hooks/use-auth.ts` — `useContext` accessor; throws if outside provider. Expose helper `effectiveUserId` = `user?.id ?? 'local'` (guest falls back to the existing `'local'` id — matches v0 data + P8 migration source).
4. On login resolving (`user` becomes non-null), clear the guest cookie + localStorage mirror (per P3.6).

**Verification:**
- `useAuth().user.id` is a real uuid after login.
- Guest mode: `user` null, `isGuest` true, `effectiveUserId === 'local'`.
- Sign-out flips `user` to null reactively (no refresh).

**Anti-pattern guard:** don't read `user.id` before `loading` resolves — gate on it. Guest path must resolve to `'local'`, never an empty/undefined id (would break cache keys + store queries).

---

## Phase 5 — SupabaseStore implementing Storage

**What to do (mirror existing `LocalStorageStore` method shapes in `lib/storage.ts`):**

1. `lib/supabase-store.ts` — `class SupabaseStore implements Storage`, ctor takes the browser supabase client. Implement `list/add/update/remove`:
   - `list(userId)` → `.from('applications').select().eq('user_id', userId).order('applied_at', { ascending: false })`. Map snake_case rows → `Application` (camelCase).
   - `add(userId, input)` → `.insert({ user_id: userId, company, role, ..., applied_at, status, updated_at }).select().single()`. Store owns id (DB default) + timestamps.
   - `update(userId, id, patch)` → `.update({ ...patch_snake, updated_at: now }).eq('id', id).eq('user_id', userId).select().single()`.
   - `remove(userId, id)` → `.delete().eq('id', id).eq('user_id', userId)`.
2. Add a `toApplication(row)` + `toRow(input)` mapper (snake↔camel) — single place.

**Verification:**
- Add an entry while logged in → row appears in Supabase table with correct `user_id`.
- Second account sees none of the first account's rows (RLS).

**Anti-pattern guard:** no `upsertMany`; use `.insert([array])`. Keep `.eq('user_id', …)` even though RLS guards — defense in depth + correct optimistic results.

---

## Phase 6 — CachedStore (localStorage read-through/write-through)

**What to do:**

1. `lib/cached-store.ts` — `class CachedStore implements Storage` wrapping `{ remote: SupabaseStore, cache: LocalStorageStore }`. Cache key scoped per user: `jobbery:applications:<userId>`.
   - `list(userId)`: return cache immediately if present; in parallel fetch `remote.list`, on resolve **last-write-wins** = remote overwrites cache + notifies (callback/event). (Hook does a background refresh — see Phase 7.)
   - `add/update/remove`: write cache optimistically, then `remote.*`; on remote error, roll back cache to pre-op snapshot.
2. Decision: keep the cache as a synchronous fast-path the hook reads first, then reconcile with the remote result. Last-write-wins = whichever finishes last wins; on conflict remote is authoritative.

**Verification:**
- Offline (throttle/devtools): cached rows still render; writes queue-fail and roll back.
- Reload after a write → remote value persists (not just cache).

**Anti-pattern guard:** never reuse a cache key across users — always suffix `userId`. Clear other-user keys on sign-in.

---

## Phase 7 — Wire hook + settings to auth

**What to do:**

1. `hooks/use-applications.ts`: remove `USER_ID = 'local'`. Read `effectiveUserId` from `useAuth()` (`user?.id ?? 'local'`). **Pick the store by mode:**
   - Guest (`isGuest`): `new LocalStorageStore()` only — NO Supabase calls (avoids unauthenticated requests that RLS would reject anyway). userId = `'local'`.
   - Authed: `new CachedStore(new SupabaseStore(supabaseClient), new LocalStorageStore())`. userId = real uuid.
   `useMemo` on `[isGuest, user?.id]`. Gate effects on a resolved id. Keep optimistic setState shapes as-is.
2. Replace the module singleton `storage` (line 98) usage: the store is now per-session, constructed in the hook (needs the client + mode + userId). Keep `Storage` interface unchanged so call sites don't move.
3. Settings → per-user when authed: add `SupabaseSettingsStore` + cache, or extend `user_settings` reads into `use-settings`. Guest = localStorage settings only (current behavior). `weeklyTarget` reads/writes go through the same cache+remote pattern, keyed by userId. Keep the `SETTINGS_EVENT` broadcast for in-tab reactivity.
4. Sign-out button in `settings-dialog.tsx` calling `supabase.auth.signOut()`.
5. **"Log in to sync" CTA** — visible only in guest mode (header next to settings, or a banner). Routes to `/login`. After login, P8 migration moves guest `'local'` data to the real user.

**Verification:**
- Guest mode: add/edit works, data in localStorage, ZERO network calls to Supabase.
- Two browsers / two accounts → disjoint data + disjoint weekly targets.
- Toggling weekly target persists across reload + devices (authed).
- Guest → click "Log in to sync" → after login, prior guest entries present under the account.

**Anti-pattern guard:** don't keep the line-98 singleton alive for data — it can't know the userId/mode. Guest mode must NOT hit Supabase (unauthenticated → RLS denies → noise). Settings theme stays local (next-themes); only `weeklyTarget` syncs when authed.

---

## Phase 8 — v0 data migration (run once)

**What to do:**

This migration now covers BOTH the original v0 user and a guest who decides to
log in — both store data under `userId: 'local'`, so the source is identical.

1. `lib/migrate-local.ts` — on first authenticated load, gather local `'local'`-scoped rows from EITHER key (`job-tracker:applications` v0 OR the guest cache `jobbery:applications:local`), and if a flag `jobbery:migrated:<userId>` is unset:
   - Read local rows, `remote.add` each under the real `userId` (or one `.insert([...])` batch via the store), then migrate local `weeklyTarget` (`job-tracker:settings`) into `user_settings`.
   - Set the migrated flag. Clear the old `'local'` keys so guest data doesn't linger/double-count.
2. Call it once from `AuthProvider` after `user` resolves (covers OAuth, magic-link, AND guest→login), guarded by the flag.

**Verification:**
- A browser with pre-existing v0 localStorage rows: after first login, those rows appear in Supabase under the new user, exactly once. Re-login does not duplicate.
- A guest who added entries then logs in: guest entries appear under the account, exactly once; guest `'local'` keys cleared.

**Anti-pattern guard:** flag MUST be userId-scoped and set only after a successful insert — else partial migration re-runs or duplicates. Must handle both the v0 key and the guest cache key as migration sources.

---

## Phase 9 — Final verification

1. `grep -rn "auth-helpers\|middleware.ts\|getSession()\|ANON_KEY\|signInWithPassword\|signUp(" .` (excl. node_modules/.next) → no matches.
2. `grep -rn "'local'" hooks lib` → only historical comments, no live code path.
3. `grep -rn "getClaims" proxy.ts` → present.
4. Manual: logged-out (no guest cookie) → `/login`; Google login → data; GitHub login (other account) → disjoint data; add/edit/delete persists across reload; weekly target syncs; v0 rows migrated once.
4b. Guest path: "Skip for now" → `/` works offline-style, zero Supabase calls; reload stays in guest; "Log in to sync" → after login, guest data migrated once, guest cookie cleared.
5. RLS proof: in Supabase SQL editor as anon, `select * from applications` → 0 rows.
6. `npm run build` clean (no type errors from snake/camel mappers).

---

## Open items deferred
- Email+password auth — intentionally NOT included (magic-link covers passwordless email).
- Multi-device real-time conflict beyond last-write-wins (could add Supabase Realtime later).
- Theme sync (staying device-local intentionally).
- Custom prod SMTP for magic-link deliverability (dev uses Supabase default SMTP).
