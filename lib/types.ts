// Core domain types for the job application tracker.
//
// Schema is intentionally future-proof: `status` and `updatedAt` exist from
// day one even though v0 never mutates them. Adding columns to persisted data
// later means writing migrations, so we pay the cost up front.

// The application pipeline, in order:
//
//   to_apply ─┬─> applied ──> in_progress ──> rejected
//             └─> expired
//
// TWO states mean the application never went out — 'to_apply' (still queued)
// and 'expired' (the posting closed before you got to it). Everything else
// implies a submission, which is what `isSubmitted()` and `appliedOnly()`
// encode. Get that set wrong and streak history silently changes underneath
// rows that were already counted.
//
// 'rejected' and 'expired' sit at the end but are outcomes, not rungs: a row
// can be rejected from any submitted stage. The order matters only for how the
// status menu lists options.
export const APPLICATION_STATUSES = [
  'to_apply',
  'applied',
  'in_progress',
  'rejected',
  'expired',
] as const

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export type Application = {
  id: string
  userId: string // 'local' in v0; real user id once auth lands
  company: string
  role: string | null
  url: string | null
  createdAt: string // ISO timestamp of when the row was logged/saved
  appliedAt: string // ISO timestamp of when the application was submitted
  note: string | null

  // Freeform user labels ('remote', 'referral', 'dream-job'). Always an array —
  // never null — so callers can map/filter without a guard. Order is the order
  // the user added them.
  tags: string[]

  status: ApplicationStatus
  updatedAt: string // ISO; bumped on every write
}

// `createdAt` never moves once written: it fixes the row's slot in the
// timeline. `appliedAt` is stamped when a queued row leaves 'to_apply' for a
// SUBMITTED status so the heatmap/streak credit the day of submission — that's why the two are
// separate fields. It is stamped ONCE, on that first transition out of
// 'to_apply': advancing 'applied' -> 'interview' later must not re-stamp it, or
// the heatmap credit jumps to the interview date. On a 'to_apply' row appliedAt
// is a placeholder (equal to createdAt) and is never read: every analytics
// helper filters to submitted rows first.

// Shape accepted by the storage layer when creating a record. The store owns
// id/timestamp generation so callers can't desync those invariants. `status`
// is optional and defaults to 'applied' (the common case = logging a submission).
export type NewApplication = {
  company: string
  role?: string | null
  url?: string | null
  note?: string | null
  tags?: string[]
  status?: ApplicationStatus
}

// Fields a caller may patch on an existing record. The store re-derives
// updatedAt; callers never set timestamps directly.
export type ApplicationPatch = Partial<
  Pick<
    Application,
    'company' | 'role' | 'url' | 'note' | 'tags' | 'status' | 'appliedAt'
  >
>

// Job details resolved from a pasted URL — by client regex and/or server fetch.
export type JobDetails = {
  company: string | null
  role: string | null
  board: string | null
  source: 'regex' | 'metadata' | 'none'
}

// Result of parsing a pasted job URL. `matched` distinguishes a recognized
// board (company extracted) from an unknown URL that needs manual entry.
export type ParsedUrl = {
  matched: boolean
  board: string | null // e.g. 'greenhouse', 'lever'; null when unmatched
  company: string | null
  url: string
}
