<div align="center">

# `[ jobbery ]`

### Keep the streak.

A friction-free job-application tracker. Paste a link, hit enter, watch your streak grow. Built to make *applying* a daily habit — not bookkeeping.

<br />

<img src="public/preview-light.png" alt="jobbery dashboard — light theme" width="720" />

<br /><br />

<img src="public/preview-dark.png" alt="jobbery dashboard — dark theme" width="720" />

<br />

</div>

---

## Why

Most trackers are spreadsheets in disguise — they make you *log*, not *apply*. jobbery flips it: a single field, instant capture, a contribution heatmap, and a weekly target that nudges you to keep the streak alive. The whole app is one screen.

## Features

- **One-field capture** — paste a job URL or type a company. A server route fetches page metadata to fill in the role + company; known job boards are recognized by regex on every keystroke.
- **Contribution heatmap** — a GitHub-style calendar of everywhere you applied. Streaks, "this week vs. target," and open count at a glance.
- **Weekly target** — set a goal; the app tells you how many more roles to apply to today to stay on pace.
- **Themeable** — a dozen+ themes (Dark, Light, GitHub, Claude, Tangerine, Lavender, Sunset…), live-applied and persisted.
- **Optional account** — works fully offline as a guest (localStorage). Log in with Google, GitHub, or a passwordless magic link to sync across devices. Guest data migrates to your account on first login.
- **Privacy by default** — guest mode makes zero network calls; your data stays in the browser until you choose to sync.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router) + React 19 |
| Styling | Tailwind CSS v4 |
| UI primitives | [Base UI](https://base-ui.com), lucide icons |
| Motion | Framer Motion |
| Auth + DB | [Supabase](https://supabase.com) (OAuth + magic link, Postgres with RLS) |
| Hosting | [Vercel](https://vercel.com) |

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). With no environment configured, the app runs in **guest mode** (localStorage only) — no setup needed to try it.

### Enable sync (Supabase)

Auth and cross-device sync are optional. To turn them on:

1. **Create a Supabase project** (directly or via the Vercel Marketplace).
2. **Run the schema** — paste [`supabase/migrations/0001_init_auth_schema.sql`](supabase/migrations/0001_init_auth_schema.sql) into the Supabase SQL editor. It creates the `applications` and `user_settings` tables with row-level security scoped to `auth.uid()`.
3. **Enable providers** — in Supabase → Auth → Providers, turn on Google, GitHub, and Email; paste each OAuth app's client id/secret. Add `http://localhost:3000/auth/callback` (and your production URL) to the redirect allow-list.
4. **Set env vars** in `.env.local`:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=your-project-url
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

Restart the dev server. Visiting the app now routes through `/login`; "Skip for now" still drops you into guest mode.

## How it's built

The storage layer is a single `Storage` interface (`lib/storage.ts`) with three implementations swapped behind it:

- **`LocalStorageStore`** — guest / offline.
- **`SupabaseStore`** — remote, user-scoped, RLS-enforced.
- **`CachedStore`** — wraps the remote store with a per-user localStorage cache (optimistic writes, remote-authoritative reads).

The `useApplications` hook picks the right store from the auth state, so components never know whether data lives in the browser or Postgres. Auth gating happens at the edge in `proxy.ts` (Next.js 16's middleware); a guest cookie lets users in without a session.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | Lint with ESLint |

---

<div align="center">
<sub>Built with Next.js + Supabase. Keep the streak. 🔥</sub>
</div>
