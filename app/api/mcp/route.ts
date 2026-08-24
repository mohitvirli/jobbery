// The jobbery MCP server — Streamable HTTP, served from the app itself.
//
// Clients authenticate with a personal access token minted in jobbery's
// settings dialog and sent as `Authorization: Bearer jbry_…`:
//
//   claude mcp add --transport http jobbery https://<host>/api/mcp \
//     --header "Authorization: Bearer jbry_…"
//
// `x-api-key: jbry_…` is accepted as an equivalent. claude.ai custom connectors
// reserve Authorization for OAuth and won't let you set it as a request header,
// so the token has to arrive under a different name there.
//
// AUTH INVARIANT: the userId comes from the verified token and nothing else.
// No tool takes a user id argument, and no handler may read one from its input.
// The stores here run on the SERVICE Supabase client (RLS bypassed — there is no
// Supabase session behind a PAT), so that explicit userId is the only thing
// keeping one user's rows away from another's.
//
// Stateless: no Redis, no SSE, plain JSON responses. Every tool is a single
// round trip, so there's nothing to stream.

import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { z } from 'zod'
import { verifyToken } from '@/lib/api-tokens'
import { InvalidJobUrlError, resolveJobDetails } from '@/lib/job-metadata'
import { computeStats } from '@/lib/stats'
import { SupabaseStore } from '@/lib/supabase-store'
import { createServiceClient } from '@/lib/supabase/service'
import type { Application, ApplicationPatch } from '@/lib/types'
import { UserSettingsStore } from '@/lib/user-settings-store'

export const runtime = 'nodejs' // node:crypto (tokens), node:dns/node:net (SSRF guard)
export const maxDuration = 60

// --- helpers ---------------------------------------------------------------

// The MCP server runs in UTC. Streak/week math must use the zone the user's
// browser reported, or these numbers won't match the dashboard.
const FALLBACK_TZ = 'UTC'

type ToolExtra = { authInfo?: AuthInfo }

// Pull the authenticated user id out of the request's AuthInfo. withMcpAuth
// already rejected unauthenticated calls with a 401; this is the type-narrowing
// guard for the tool body.
function requireUserId(extra: ToolExtra): string {
  const userId = extra.authInfo?.extra?.userId
  if (typeof userId !== 'string') throw new Error('missing authenticated user')
  return userId
}

function ok(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] }
}

function fail(message: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  }
}

// Every tool body runs through this so a Supabase/network failure reaches the
// model as a readable message instead of an unhandled rejection.
async function guard<T>(run: () => Promise<T>) {
  try {
    return (await run()) as ReturnType<typeof ok>
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'unknown error')
  }
}

// Trimmed row shape for tool output — the store's Application minus userId and
// updatedAt, which are noise for a model deciding what to do next.
function compact(a: Application) {
  return {
    id: a.id,
    company: a.company,
    role: a.role,
    url: a.url,
    note: a.note,
    status: a.status,
    appliedAt: a.appliedAt,
  }
}

function stores() {
  const client = createServiceClient()
  return {
    apps: new SupabaseStore(client),
    settings: new UserSettingsStore(client),
  }
}

// --- tools -----------------------------------------------------------------

const statusSchema = z
  .enum(['applied', 'to_apply'])
  .describe(
    "'applied' = already submitted (credits the streak and heatmap today); " +
      "'to_apply' = saved to the backlog to submit later"
  )

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'log_application',
      {
        title: 'Log a job application',
        description:
          'Record a job application in jobbery. Use this after the user says they applied ' +
          "somewhere, or to queue a role they intend to apply to (status 'to_apply'). If the " +
          'user gives a job URL, call parse_job_url first to fill in company and role. Returns ' +
          'the created record plus the refreshed streak and pace numbers.',
        inputSchema: {
          company: z.string().min(1).describe('Hiring company name'),
          role: z.string().nullish().describe('Job title, e.g. "Senior Backend Engineer"'),
          url: z.string().nullish().describe('Link to the job posting'),
          note: z.string().nullish().describe('Freeform note — referral, contact, salary…'),
          status: statusSchema.default('applied'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      },
      async ({ company, role, url, note, status }, extra) =>
        guard(async () => {
          const userId = requireUserId(extra)
          const { apps, settings } = stores()

          const created = await apps.add(userId, { company, role, url, note, status })

          const [all, { weeklyTarget, timeZone }] = await Promise.all([
            apps.list(userId),
            settings.get(userId),
          ])
          const stats = computeStats(all, weeklyTarget, timeZone ?? FALLBACK_TZ)

          return ok({
            application: compact(created),
            currentStreak: stats.currentStreak,
            todayCount: stats.todayCount,
            thisWeekCount: stats.thisWeekCount,
            weeklyTarget: stats.weeklyTarget,
            applyToday: stats.applyToday,
          })
        })
    )

    server.registerTool(
      'list_applications',
      {
        title: 'List job applications',
        description:
          "Read the user's tracked job applications, newest first. Filter to answer questions " +
          'like "what have I applied to this week?" or "what\'s still in my queue?". Omit all ' +
          'filters to get a recent overview.',
        inputSchema: {
          status: statusSchema.optional().describe('Only rows with this status'),
          since: z
            .string()
            .optional()
            .describe('ISO date or timestamp — only rows applied on/after this'),
          until: z
            .string()
            .optional()
            .describe('ISO date or timestamp — only rows applied on/before this'),
          company: z
            .string()
            .optional()
            .describe('Case-insensitive substring match on the company name'),
          limit: z.number().int().min(1).max(200).default(50),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ status, since, until, company, limit }, extra) =>
        guard(async () => {
          const userId = requireUserId(extra)
          const { apps } = stores()
          let rows = await apps.list(userId)

          if (status) rows = rows.filter((a) => a.status === status)
          if (since) {
            const t = Date.parse(since)
            if (Number.isNaN(t)) throw new Error(`invalid \`since\` date: ${since}`)
            rows = rows.filter((a) => Date.parse(a.appliedAt) >= t)
          }
          if (until) {
            const t = Date.parse(until)
            if (Number.isNaN(t)) throw new Error(`invalid \`until\` date: ${until}`)
            rows = rows.filter((a) => Date.parse(a.appliedAt) <= t)
          }
          if (company) {
            const needle = company.toLowerCase()
            rows = rows.filter((a) => a.company.toLowerCase().includes(needle))
          }

          return ok({
            total: rows.length,
            returned: Math.min(rows.length, limit),
            applications: rows.slice(0, limit).map(compact),
          })
        })
    )

    server.registerTool(
      'update_application',
      {
        title: 'Update a job application',
        description:
          'Edit an existing application. The commonest use is moving a queued role to ' +
          "'applied' once the user submits it. Get the id from list_applications first. " +
          'Omitted fields are left unchanged.',
        inputSchema: {
          id: z.string().describe('Application id from list_applications'),
          company: z.string().min(1).optional(),
          role: z.string().nullish(),
          url: z.string().nullish(),
          note: z.string().nullish(),
          status: statusSchema.optional(),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      },
      async ({ id, company, role, url, note, status }, extra) =>
        guard(async () => {
          const userId = requireUserId(extra)
          const { apps } = stores()

          const patch: ApplicationPatch = {}
          if (company !== undefined) patch.company = company
          if (role !== undefined) patch.role = role ?? null
          if (url !== undefined) patch.url = url ?? null
          if (note !== undefined) patch.note = note ?? null
          if (status !== undefined) {
            patch.status = status
            // Mirrors useApplications.setStatus: submitting re-stamps the date so
            // the heatmap credits the day you actually applied. Re-queueing leaves
            // it alone — that's not an un-apply.
            if (status === 'applied') patch.appliedAt = new Date().toISOString()
          }

          try {
            return ok({ application: compact(await apps.update(userId, id, patch)) })
          } catch (err) {
            // PostgREST answers a .single() that matched nothing with "Cannot
            // coerce the result to a single JSON object" — useless to a model.
            // Every other failure keeps its original message.
            if (err instanceof Error && err.message.includes('coerce the result')) {
              throw new Error(
                `no application with id ${id} — call list_applications to get a valid id`
              )
            }
            throw err
          }
        })
    )

    server.registerTool(
      'delete_application',
      {
        title: 'Delete a job application',
        description:
          'PERMANENTLY delete an application from jobbery. This cannot be undone and will ' +
          'change the heatmap and streak. Only use it when the user explicitly asks to remove ' +
          "a record — to mark something as no longer active, prefer update_application. " +
          'Confirm with the user before calling.',
        inputSchema: { id: z.string().describe('Application id from list_applications') },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
      },
      async ({ id }, extra) =>
        guard(async () => {
          const userId = requireUserId(extra)
          const { apps } = stores()
          await apps.remove(userId, id)
          return ok({ deleted: id })
        })
    )

    server.registerTool(
      'get_stats',
      {
        title: 'Get application momentum stats',
        description:
          'The same numbers the jobbery dashboard shows: current and best streak, how many ' +
          'applications went out today and this week, the weekly target, and how many more to ' +
          'send today to stay on pace. Use this for "am I on track?" questions.',
        inputSchema: {
          timeZone: z
            .string()
            .optional()
            .describe(
              'IANA zone for day boundaries, e.g. "Asia/Kolkata". Defaults to the zone saved ' +
                'from the web app, then UTC. Only pass this to override.'
            ),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ timeZone }, extra) =>
        guard(async () => {
          const userId = requireUserId(extra)
          const { apps, settings } = stores()
          const [all, saved] = await Promise.all([apps.list(userId), settings.get(userId)])
          const tz = timeZone ?? saved.timeZone ?? FALLBACK_TZ
          return ok({ ...computeStats(all, saved.weeklyTarget, tz), timeZone: tz })
        })
    )

    server.registerTool(
      'parse_job_url',
      {
        title: 'Read a job posting URL',
        description:
          'Fetch a job posting and extract the company and role from its page metadata. ' +
          'Read-only — it records nothing. Pair it with log_application when the user pastes ' +
          'a link. Returns nulls if the page has no usable metadata; ask the user instead of ' +
          'guessing.',
        inputSchema: { url: z.string().describe('Public http(s) URL of the job posting') },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ url }) =>
        guard(async () => {
          try {
            return ok(await resolveJobDetails(url))
          } catch (err) {
            if (err instanceof InvalidJobUrlError) throw new Error(`${err.message}: ${url}`)
            throw err
          }
        })
    )

    server.registerTool(
      'set_weekly_target',
      {
        title: 'Set the weekly application target',
        description:
          'Change how many applications the user aims to send per week. This drives the pace ' +
          'nudge and the "this week" progress bar in the app.',
        inputSchema: {
          weeklyTarget: z.number().int().min(1).max(50).describe('Applications per week'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      },
      async ({ weeklyTarget }, extra) =>
        guard(async () => {
          const userId = requireUserId(extra)
          const { settings } = stores()
          await settings.set(userId, weeklyTarget)
          return ok({ weeklyTarget })
        })
    )
  },
  { serverInfo: { name: 'jobbery', version: '0.1.0' } },
  {
    // basePath '/api' derives the streamable HTTP endpoint as '/api/mcp',
    // which is this file.
    basePath: '/api',
    // SSE needs Redis for cross-request session state; every tool here is a
    // single round trip, so plain JSON is enough.
    disableSse: true,
    maxDuration: 60,
  }
)

// Resolve the bearer token to a jobbery user. Returning undefined makes
// withMcpAuth answer 401 — there is deliberately no anonymous fallback.
const authed = withMcpAuth(
  handler,
  async (req, bearerToken): Promise<AuthInfo | undefined> => {
    // `Authorization: Bearer <token>` is the primary form. x-api-key is the
    // fallback for claude.ai custom connectors: there, Authorization is
    // reserved for OAuth and can't be set as a request header, so an
    // API-key-style server has to accept the credential somewhere else.
    // x-api-key is on Claude's header allowlist.
    const token = bearerToken ?? req.headers.get('x-api-key') ?? undefined
    if (!token) return undefined

    let verified: Awaited<ReturnType<typeof verifyToken>>
    try {
      verified = await verifyToken(createServiceClient(), token)
    } catch (err) {
      // withMcpAuth turns any throw into a flat 401, which would make a missing
      // SUPABASE_SECRET_KEY look exactly like a bad token. Log the real cause so
      // it's findable in `vercel logs`.
      console.error('[mcp] token verification failed', err)
      return undefined
    }
    if (!verified) return undefined
    return {
      token,
      clientId: verified.tokenId,
      scopes: [],
      extra: { userId: verified.userId },
    }
  },
  { required: true }
)

export { authed as GET, authed as POST, authed as DELETE }
