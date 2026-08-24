-- jobbery: freeform per-row tags + the widened status pipeline.
--
-- Tags are a plain text[] on the row rather than a normalized tags table: they
-- are per-user freeform labels with no attributes of their own (no colour, no
-- rename-everywhere), so a join table would buy nothing but joins. The GIN
-- index keeps `tags @> '{remote}'` fast if filtering ever moves server-side —
-- today the dashboard filters the already-loaded list in the browser.
--
-- NOTE on status: `status` is a bare text column with no check constraint, so
-- widening the app-level enum from ('to_apply','applied') to the full pipeline
-- ('interview','offer','rejected') needs NO schema change. We deliberately do
-- not add a constraint here — the app owns the vocabulary, and a constraint
-- would turn every future stage into a migration.

alter table public.applications
  add column tags text[] not null default '{}';

create index applications_tags_idx
  on public.applications using gin (tags);
