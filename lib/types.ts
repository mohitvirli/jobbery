// Core domain types for the job application tracker.
//
// Schema is intentionally future-proof: `status` and `updatedAt` exist from
// day one even though v0 never mutates them. Adding columns to persisted data
// later means writing migrations, so we pay the cost up front.

// Two-stage status. 'to_apply' = saved/queued; 'applied' = submitted.
// v1 may widen further: | 'interview' | 'offer' | 'rejected'.
export type ApplicationStatus = 'to_apply' | 'applied'

export type Application = {
  id: string
  userId: string // 'local' in v0; real user id once auth lands
  company: string
  role: string | null
  url: string | null
  appliedAt: string // ISO timestamp of when the application was logged
  note: string | null

  // Reserved for v1. Not surfaced in the v0 UI.
  status: ApplicationStatus
  updatedAt: string // ISO; mirrors appliedAt until status edits exist
}

// Shape accepted by the storage layer when creating a record. The store owns
// id/timestamp generation so callers can't desync those invariants. `status`
// is optional and defaults to 'applied' (the common case = logging a submission).
export type NewApplication = {
  company: string
  role?: string | null
  url?: string | null
  note?: string | null
  status?: ApplicationStatus
}

// Fields a caller may patch on an existing record. The store re-derives
// updatedAt; callers never set timestamps directly.
export type ApplicationPatch = Partial<
  Pick<Application, 'company' | 'role' | 'url' | 'note' | 'status' | 'appliedAt'>
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
