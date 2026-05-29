// Lightweight, client-only job-board URL parser.
//
// v0 does NOT fetch the page — pure regex pattern-matching on the URL string.
// Real JD autofill (fetching the page) is v1.5. When a board matches we extract
// the company slug; role stays null (can't know it without fetching).
//
// Adding a board = append one entry to BOARDS. Each pattern captures the company
// slug in group 1.

import type { JobDetails, ParsedUrl } from './types'

type BoardPattern = {
  board: string
  // Regex over the URL; capture group 1 = company slug.
  test: RegExp
}

const BOARDS: BoardPattern[] = [
  // boards.greenhouse.io/{company}/jobs/{id}
  { board: 'greenhouse', test: /boards\.greenhouse\.io\/([^/]+)\/jobs\//i },
  // jobs.lever.co/{company}/{id}
  { board: 'lever', test: /jobs\.lever\.co\/([^/]+)/i },
  // jobs.ashbyhq.com/{company}/{id}
  { board: 'ashby', test: /jobs\.ashbyhq\.com\/([^/]+)/i },
  // apply.workable.com/{company}/
  { board: 'workable', test: /apply\.workable\.com\/([^/]+)/i },
]

// Turn a slug ("acme-corp", "acmeCorp") into a display-friendly name ("Acme Corp").
function humanizeSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2') // split camelCase
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// True if the string looks like a URL (so we know to attempt parsing vs treat as free text).
export function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim()) || /^[\w-]+\.[\w.-]+\//.test(s.trim())
}

// Parse a pasted string. `matched: false` means caller should show manual
// company/role fields.
export function parseJobUrl(raw: string): ParsedUrl {
  const url = raw.trim()
  for (const { board, test } of BOARDS) {
    const m = url.match(test)
    if (m && m[1]) {
      return { matched: true, board, company: humanizeSlug(m[1]), url }
    }
  }
  return { matched: false, board: null, company: null, url }
}

// Ask our server route to fetch the page and extract role + company from
// metadata. Returns 'none' source on any failure so callers degrade to the
// instant regex guess. Optional AbortSignal lets the caller cancel stale
// in-flight requests as the user keeps typing.
export async function fetchJobMetadata(
  url: string,
  signal?: AbortSignal
): Promise<JobDetails> {
  const none: JobDetails = { company: null, role: null, board: null, source: 'none' }
  try {
    const res = await fetch(`/api/parse?url=${encodeURIComponent(url)}`, { signal })
    if (!res.ok) return none
    return (await res.json()) as JobDetails
  } catch {
    return none // network error or aborted
  }
}
