// Pure filtering for the timeline view.
//
// Kept as a plain function over an already-loaded array: the dashboard holds
// every row in memory anyway (the heatmap and stats need the full set), so
// narrowing the view is a synchronous list operation with no loading state and
// no network. If the list ever outgrows that, this function is the seam to
// swap for a server query — nothing else knows how filtering works.

import type { Application, ApplicationStatus } from './types'
import { normalizeTag } from './tags'

export type TimelineFilter = {
  query: string
  statuses: ApplicationStatus[]
  tags: string[]
}

export const EMPTY_FILTER: TimelineFilter = { query: '', statuses: [], tags: [] }

export function isFilterActive(f: TimelineFilter): boolean {
  return f.query.trim() !== '' || f.statuses.length > 0 || f.tags.length > 0
}

// Everything a query can match on, lowercased once per row.
function haystack(a: Application): string {
  return [a.company, a.role, a.note, ...a.tags]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function filterApplications(
  apps: Application[],
  filter: TimelineFilter
): Application[] {
  // Multi-word queries are AND-ed term by term rather than matched as one
  // literal string, so "acme senior" finds "Acme Corp — Senior Engineer"
  // instead of nothing.
  const terms = filter.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const tags = filter.tags.map(normalizeTag).filter(Boolean)

  return apps.filter((a) => {
    // Statuses are OR-ed: a row has exactly one, so AND would match nothing.
    if (filter.statuses.length > 0 && !filter.statuses.includes(a.status)) {
      return false
    }
    // Tags are AND-ed: picking a second tag should narrow the list, which is
    // what "add a filter" means everywhere else in this bar.
    if (tags.length > 0 && !tags.every((t) => a.tags.includes(t))) return false
    if (terms.length > 0) {
      const hay = haystack(a)
      if (!terms.every((t) => hay.includes(t))) return false
    }
    return true
  })
}
