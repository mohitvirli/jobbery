// Presentation + transition rules for ApplicationStatus.
//
// Kept out of the components so the timeline row, the filter chips, and the
// status menu can't disagree about what a stage is called, coloured, or dimmed
// to. The vocabulary itself lives in lib/types.ts; this file only decorates it.

import type { ApplicationStatus } from './types'
import { APPLICATION_STATUSES } from './types'

type StatusMeta = {
  label: string
  // Badge variant from components/ui/badge.tsx — reuses the existing semantic
  // palette so statuses theme correctly in dark mode without new colours.
  variant: 'outline' | 'secondary' | 'info' | 'error' | 'warning'
  // Solid fill for the rail node on stages past the checkbox.
  dot: string
  // Strike the company/role text? This reads as "closed", not "submitted":
  // 'applied' is struck because the task is done, 'rejected' because the row is
  // dead. 'interview' and 'offer' are live opportunities — striking them would
  // say the opposite of what they mean, so advancing from applied -> interview
  // retracts the strike, which is exactly the right signal.
  struck: boolean
  // Resting row opacity. Live rows (backlog, interview, offer) stay at full
  // strength; finished ones recede so the list foregrounds what needs action.
  opacity: number
}

export const STATUS_META: Record<ApplicationStatus, StatusMeta> = {
  to_apply: {
    label: 'To apply',
    variant: 'outline',
    dot: 'bg-muted-foreground',
    struck: false,
    opacity: 1,
  },
  applied: {
    label: 'Applied',
    variant: 'secondary',
    dot: 'bg-muted-foreground',
    struck: true,
    opacity: 0.5,
  },
  in_progress: {
    label: 'In Progress',
    variant: 'info',
    dot: 'bg-info',
    struck: false,
    opacity: 1,
  },
  rejected: {
    label: 'Rejected',
    variant: 'error',
    dot: 'bg-destructive',
    struck: true,
    opacity: 0.4,
  },
  expired: {
    // Amber rather than red: the posting lapsed, nobody turned you down.
    // Dimmest of all — a row you can neither act on nor learn from.
    label: 'Expired',
    variant: 'warning',
    dot: 'bg-warning',
    struck: true,
    opacity: 0.35,
  },
}

// Statuses that predate the current vocabulary, mapped forward on read.
// 'interview' and 'offer' were folded into the single 'in_progress' stage; rows
// carrying them may still exist in localStorage, or in Postgres if the SQL
// migration hasn't been applied yet, so every read path normalizes rather than
// trusting the stored string.
const LEGACY_STATUSES: Record<string, ApplicationStatus> = {
  interview: 'in_progress',
  offer: 'in_progress',
}

export function normalizeStatus(raw: string): ApplicationStatus {
  if ((APPLICATION_STATUSES as readonly string[]).includes(raw)) {
    return raw as ApplicationStatus
  }
  // Unknown values fall back to the store's insert default rather than
  // throwing — a row with a status we can't read is still a row worth showing.
  return LEGACY_STATUSES[raw] ?? 'applied'
}

// Display order for menus and filter chips.
export const STATUS_ORDER = APPLICATION_STATUSES

// Did this application actually go out? Two states say no: 'to_apply' (still
// queued) and 'expired' (the posting closed before it was submitted). Mirrors
// appliedOnly() in lib/date.ts for single-row checks — the two must agree.
export function isSubmitted(status: ApplicationStatus): boolean {
  return status !== 'to_apply' && status !== 'expired'
}

// The checkbox is the fast to_apply <-> applied shortcut, and it owns the rail
// node only while the row is still in that binary world. Past 'applied' the
// node becomes a colour-coded dot, so a stray click can't collapse
// 'in_progress' back to 'to_apply' and silently lose the stage.
export function usesCheckbox(status: ApplicationStatus): boolean {
  return status === 'to_apply' || status === 'applied'
}

// Should this transition (re)stamp `appliedAt`?
//
// Only a crossing from NOT-submitted to submitted counts. `appliedAt` is the
// date the heatmap and streak credit, so it is written once, when the
// application actually goes out:
//   to_apply -> applied       stamp  (this is the submission)
//   to_apply -> in_progress   stamp  (logged late; the submission still happened)
//   expired  -> applied       stamp  (mis-filed, then actually submitted)
//   to_apply -> expired       NO     (it never went out — both sides unsubmitted)
//   applied  -> in_progress   NO     (would drag the credit to the interview date)
//   applied  -> to_apply      NO     (re-queued, not un-applied; date is harmless
//                                     because analytics skip 'to_apply' rows)
//
// Testing `!isSubmitted(from)` rather than `from === 'to_apply'` matters now
// that there are two unsubmitted states: pinning it to 'to_apply' would leave
// an expired-then-submitted row crediting its creation date instead of today.
export function shouldStampAppliedAt(
  from: ApplicationStatus,
  to: ApplicationStatus
): boolean {
  return !isSubmitted(from) && isSubmitted(to)
}
