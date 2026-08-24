// GET /api/parse?url=<job-url>
//
// Thin HTTP wrapper over resolveJobDetails (lib/job-metadata) — that module owns
// the fetch, the SSRF guard, and the JSON-LD/OG extraction, and is shared with
// the parse_job_url MCP tool so both paths behave identically. Returns
// JobDetails the client merges over its instant regex guess.

import {
  EMPTY_JOB_DETAILS,
  InvalidJobUrlError,
  resolveJobDetails,
} from '@/lib/job-metadata'

export const runtime = 'nodejs' // node:dns / node:net needed for the SSRF guard

export async function GET(req: Request): Promise<Response> {
  const target = new URL(req.url).searchParams.get('url')
  if (!target) return Response.json(EMPTY_JOB_DETAILS, { status: 400 })

  try {
    return Response.json(await resolveJobDetails(target), { status: 200 })
  } catch (err) {
    // Malformed URL → 400, non-http(s) scheme → 422; matches the original
    // contract the quick-add field was written against. Every other failure
    // (timeout, DNS, blocked host, non-2xx) already degrades to empty details
    // inside resolveJobDetails, so the client can fall back to its regex guess.
    if (err instanceof InvalidJobUrlError) {
      const status = err.message.startsWith('only http') ? 422 : 400
      return Response.json(EMPTY_JOB_DETAILS, { status })
    }
    throw err
  }
}
