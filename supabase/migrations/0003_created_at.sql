-- jobbery: split "logged" from "submitted".
--
-- applied_at is re-stamped when a queued row flips to 'applied', which used to
-- yank the row into today's timeline group. created_at is the immutable log
-- date: the timeline sorts and groups by it, so a row never moves, while
-- applied_at stays free to carry the real submission date for streak/heatmap.
--
-- Backfill: existing rows were logged and applied at the same instant as far
-- as we can tell, so created_at = applied_at preserves current ordering exactly.

alter table public.applications
  add column created_at timestamptz;

update public.applications set created_at = applied_at where created_at is null;

alter table public.applications
  alter column created_at set not null,
  alter column created_at set default now();

-- Timeline reads order by created_at desc; mirror the applied_at index.
create index applications_user_created_idx
  on public.applications (user_id, created_at desc);
