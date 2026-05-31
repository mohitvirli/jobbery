-- jobbery: initial auth-scoped schema + RLS
-- Run in Supabase SQL editor (or `supabase db push`).
-- Mirrors lib/types.ts Application (snake_case here, camelCase in app via store mapper).

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

-- RLS: the user-scope guard. Every query auto-filtered to auth.uid().
alter table public.applications enable row level security;
create policy "own applications" on public.applications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.user_settings enable row level security;
create policy "own settings" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
