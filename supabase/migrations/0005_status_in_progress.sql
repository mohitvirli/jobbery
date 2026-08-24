-- jobbery: fold 'interview' and 'offer' into a single 'in_progress' stage, and
-- introduce 'expired'.
--
-- The two middle stages were never acted on differently — both meant "this one
-- is alive and it's their move" — so carrying two labels bought a decision at
-- every update and no extra signal. They collapse into one.
--
-- 'expired' needs no backfill: it's a NEW terminal state for backlog rows whose
-- posting closed before they were submitted. It is deliberately NOT counted as
-- a submission (see appliedOnly in lib/date.ts), so it never credits the streak
-- or heatmap.
--
-- `status` is a bare text column with no check constraint, so this is data-only
-- — no schema change. The app also normalizes on read (normalizeStatus in
-- lib/status.ts), so it renders correctly whether or not this has been run.

update public.applications
   set status = 'in_progress',
       updated_at = now()
 where status in ('interview', 'offer');
