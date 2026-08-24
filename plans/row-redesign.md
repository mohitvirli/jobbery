# Row redesign: role stacking, status pipeline, tags, search

## Goal

Rework the timeline row from a single-line `[✓] Company · Role … time 🗑` into a
two-line card carrying more state:

```
[✓]  Acme Corp                                    [Interview]   12 Aug  🗑
     Senior Frontend Engineer          #remote #referral
```

Three additions land together because they share the same row surface and the
same `Application` record: a widened status pipeline, freeform tags, and a
search/filter bar above the timeline.

## Decisions

| Area | Decision |
|---|---|
| Status | Widen the enum to the full pipeline. The checkbox stays as the fast `to_apply → applied` shortcut; a pill next to the company advances further stages. |
| Tags | Freeform per-row tags in a `text[]` column. Autocomplete suggests tags the user already used. No separate tags table. |
| Search | Client-side filter over the already-loaded list, plus status and tag filter chips. No new network path. |

## Status model

```ts
type ApplicationStatus = 'to_apply' | 'applied' | 'interview' | 'offer' | 'rejected'
```

`status text` in Postgres has no enum/check constraint today, so **no DB change
is needed for the widened statuses** — only the app-level type.

Two invariants must be preserved:

1. **Analytics.** `appliedOnly()` in `lib/date.ts:91` is the single choke point
   for streak, heatmap, weekly count and totals. It becomes
   `status !== 'to_apply'` — an interview/offer/rejected row was submitted, so
   it must keep crediting the day it was submitted. Leaving it as
   `status === 'applied'` would silently erase streak days the moment a row
   advances to interview. `openCount()` (`status === 'to_apply'`) is unchanged.
2. **`appliedAt` stamping.** Today `setStatus` re-stamps `appliedAt = now` on
   *every* transition into `'applied'`. With more stages the rule must become:
   stamp only when moving **out of `to_apply`** into any submitted status.
   Advancing `applied → interview` must NOT re-stamp, or the heatmap credit
   jumps to the interview date. Same rule mirrored in the MCP `update_application`
   tool.

Badge mapping (existing `components/ui/badge.tsx` variants, no new CSS):
`to_apply → outline`, `applied → secondary`, `interview → info`,
`offer → success`, `rejected → error`.

## Row layout

```
col 1  rail node / checkbox        w-5, pinned to line 1
col 2  flex-1 min-w-0
         line 1: company (bold, strike when submitted) + status pill
         line 2: role (muted, truncate) + tag chips
col 3  time + delete               unchanged
```

**Rail geometry is the one real layout risk.** The continuous rail line in
`timeline.tsx` is absolutely positioned with hardcoded offsets
(`left-[78px] top-[22px] bottom-[22px]`) derived from a single-line row height.
A two-line row breaks the top/bottom endpoints. Fix: switch the row to
`items-start` with a fixed top padding on the checkbox so the first node's
center stays at the same y offset regardless of whether line 2 renders; then
`top-[22px]` stays correct and only `bottom-*` needs recomputing against the
last row's first-line center.

Strike-through semantics stay as-is: `struck = status !== 'to_apply'`.

## Tags

```sql
alter table public.applications
  add column tags text[] not null default '{}';
create index applications_tags_idx on public.applications using gin (tags);
```

- Editor: a `+` affordance revealed on row hover opens an autocomplete
  (`components/ui/autocomplete.tsx` already exists) whose suggestions are
  derived client-side from the distinct tags across the loaded list. Enter adds,
  Backspace on an empty input removes the last chip.
- localStorage rows written before this column exist get `tags: []` backfilled
  on read, the same pattern already used for `createdAt` in `lib/storage.ts:39`.

## Search + filters

New pure `filterApplications(apps, { query, statuses, tags })`:
- `query` matches case-insensitively against company, role, note and tags.
- `statuses` / `tags` are OR-within, AND-across.

Placement: between `QuickAdd` and `Timeline` in the left column's **pinned**
(non-scrolling) region, so it stays visible while the timeline scrolls.

Filter state lives in `Dashboard` and is applied **only to the Timeline** — the
heatmap and stats keep receiving the full unfiltered list, since they describe
overall momentum, not the current view.

Filtered-to-zero renders a distinct empty state with a "clear filters" action,
separate from the existing "no applications yet".

## Phases

### 1 — Data layer
1. `supabase/migrations/0004_tags.sql` — tags column + GIN index.
2. `lib/types.ts` — widen `ApplicationStatus`; add `tags: string[]` to
   `Application`, `NewApplication`, `ApplicationPatch`.
3. `lib/date.ts` — `appliedOnly` → `status !== 'to_apply'`.
4. `lib/storage.ts` — tags default on add, backfill on read.
5. `lib/supabase-store.ts` — `ApplicationRow.tags`, all three mappers.
6. `lib/cached-store.ts` — tags on the optimistic row.
7. `lib/migrate-local.ts` — tags on the insert row.

### 2 — Status UI
8. `lib/status.ts` (new) — order, labels, badge variant map, `isSubmitted()`,
   `nextStatus()`.
9. `hooks/use-applications.ts` — new `appliedAt` stamping rule (out of
   `to_apply` only).
10. `components/timeline/status-pill.tsx` (new) — Badge trigger +
    `components/ui/menu.tsx` for stage selection.
11. `components/timeline/timeline.tsx` — two-line Row, checkbox pinned to line
    1, rail offsets recomputed.

### 3 — Tags
12. `components/timeline/tag-input.tsx` (new) — chips + autocomplete.
13. `hooks/use-applications.ts` — `setTags(id, tags)`.
14. `timeline.tsx` — render chips on line 2, wire the editor.

### 4 — Search
15. `lib/filter.ts` (new) — pure filter fn.
16. `components/timeline/timeline-filters.tsx` (new) — search input + status
    chips + tag chips.
17. `components/dashboard.tsx` — filter state; filtered list to Timeline only.
18. `timeline.tsx` — filtered-empty state.

### 5 — MCP
19. `app/api/mcp/route.ts` — widen `statusSchema`, add `tags` to
    `log_application` / `update_application`, add a tag filter to
    `list_applications`, serialize `tags`, apply the same `appliedAt` rule.

## What changed during implementation

Deviations from the plan above, all found while verifying in the browser:

- **Strike-through means "closed", not "submitted".** Striking an `interview`
  or `offer` row said the opposite of what those stages mean, so only `applied`
  and `rejected` are struck. Advancing `applied -> interview` now retracts the
  strike, which reads as the row coming back to life.
- **Row opacity is per-status**, not a binary dim: backlog, interview and offer
  stay at full strength (they need action), `applied` drops to 0.5 and
  `rejected` to 0.4.
- **The checkbox is only rendered for `to_apply` and `applied`.** Past that it
  becomes a colour-coded read-only dot, because unticking an `interview` row
  would collapse it to `to_apply` and silently discard the stage.
- **The company is a real `<a href>`** rather than a `role="link"` div with a
  `window.open` handler — it gets an accessible name, middle-click and
  open-in-new-tab for free. The role beside it is plain text, so each row has
  one link instead of two tab stops to the same destination.
- **The rail is masked, not hard-clipped.** Rows are no longer a fixed height
  (tags wrap on narrow screens), so the line fades out at the last node instead
  of ending at a hardcoded offset.
- **Line 2 wraps.** Tag chips are `shrink-0` and were squeezing the role down to
  an ellipsis at mobile widths; wrapping gives a long role its own line and
  drops the tags underneath.
- **Both tag lists keep a stable order.** Sorting selected tags to the top moved
  the next row out from under the cursor mid-click.
- **The tag popup is anchored to the row's tag line**, not to the `+` button —
  the `+` sits after the chips, so adding a tag would otherwise make the popup
  hop sideways.
- **Hover-only controls are pinned visible on coarse pointers**, so the backlog
  status pill and the tag `+` are reachable on touch.
- **MCP `update_application` reads the row before patching**, because the
  `appliedAt` rule needs the previous status.

## Follow-up: In Progress + Expired

The pipeline was later reworked:

```
to_apply ─┬─> applied ──> in_progress ──> rejected
          └─> expired
```

- **`interview` + `offer` folded into `in_progress`.** Neither was ever acted on
  differently — both meant "alive, their move" — so two labels bought a decision
  at every update and no extra signal. `0005_status_in_progress.sql` rewrites
  existing rows; `normalizeStatus()` in `lib/status.ts` also maps the old values
  on every read, so the app renders correctly whether or not the SQL has run.
- **`expired` added** for a posting that closed before it was submitted. It is
  NOT a submission: `appliedOnly()` now excludes both `to_apply` and `expired`,
  and `isSubmitted()` mirrors that.
- **`shouldStampAppliedAt` generalized** from `from === 'to_apply'` to
  `!isSubmitted(from)`. With two unsubmitted states, the narrower test would
  leave an expired-then-submitted row crediting its creation date instead of
  the day it actually went out.

Known edge, accepted deliberately: moving an ALREADY-SUBMITTED row to `expired`
retroactively drops its streak day, because "was this submitted?" is inferred
from the current status rather than recorded. Rows that went out and went quiet
belong in `rejected`. Making this exact needs a nullable `submittedAt` column.

## Deploying

`supabase/migrations/0004_tags.sql` has to run before the app is deployed —
reads select `tags` and writes send it.

`0005_status_in_progress.sql` is data-only and non-blocking: reads normalize the
old `interview`/`offer` values anyway, so it can run any time after deploy. The
status vocabulary itself needs no schema change — `status` is a bare `text`
column with no check constraint.

## Not included

- No status history / audit trail (no "when did it reach interview" column).
- No per-tag colors or tag rename-everywhere (would need the normalized tables).
- No server-side search; if the list ever outgrows client filtering, `lib/filter.ts`
  is the seam to swap.
