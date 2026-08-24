-- jobbery: personal access tokens (for the MCP server) + user time zone
-- Run in Supabase SQL editor (or `supabase db push`) after 0001.

-- Tokens the user pastes into an MCP client. Only the sha256 hash is stored —
-- the plaintext is shown once at creation and is unrecoverable afterwards.
create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  prefix text not null, -- leading chars of the plaintext, for display only
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index api_tokens_user_idx on public.api_tokens (user_id, created_at desc);

-- RLS: same user-scope guard as the other tables. Note the MCP route reads this
-- table with the service key (pre-auth, there is no auth.uid() yet) — this
-- policy governs the cookie-authed /api/tokens management endpoints.
alter table public.api_tokens enable row level security;
create policy "own tokens" on public.api_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- IANA zone (e.g. 'Asia/Kolkata'), written by the browser on load. The app
-- buckets days in the browser's local time; the MCP server runs in UTC, so it
-- needs this to compute streaks that agree with what the dashboard shows.
alter table public.user_settings add column time_zone text;
