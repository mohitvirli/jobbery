// GET /api/parse?url=<job-url>
//
// Server-side metadata fetch. The browser can't read a job board's page
// (cross-origin), so this route fetches the HTML and extracts the role + company
// from JSON-LD (schema.org JobPosting, the richest source) with an Open Graph /
// <title> fallback. Returns JobDetails the client merges over its instant regex
// guess.
//
// SECURITY: any public http(s) URL is fetchable, but an SSRF guard blocks
// private/internal targets. We reject non-http(s) schemes, resolve the host's
// IPs and refuse any that land in a private/loopback/link-local/CGNAT/metadata
// range, and re-validate every redirect hop (so a public host can't 302 us to
// 169.254.169.254). Plus a timeout and a response-size cap.

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { JobDetails } from '@/lib/types'
import { parseJobUrl } from '@/lib/url-parser'

export const runtime = 'nodejs' // node:dns / node:net needed for the SSRF guard

const FETCH_TIMEOUT_MS = 5000
const MAX_BYTES = 1_000_000 // 1 MB cap; metadata lives in <head>, early in the doc
const MAX_REDIRECTS = 4

// True if an IP literal sits in a range we must never fetch from the server.
function isPrivateIp(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const o = ip.split('.').map(Number)
    if (o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true
    const [a, b] = o
    return (
      a === 0 || // 0.0.0.0/8
      a === 10 || // private
      a === 127 || // loopback
      (a === 169 && b === 254) || // link-local / cloud metadata
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 168) || // private
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 198 && (b === 18 || b === 19)) // benchmarking
    )
  }
  if (v === 6) {
    const lc = ip.toLowerCase()
    if (lc === '::1' || lc === '::') return true // loopback / unspecified
    if (lc.startsWith('fe80') || lc.startsWith('fc') || lc.startsWith('fd')) return true // link-local / ULA
    // IPv4-mapped (::ffff:a.b.c.d) — unwrap and re-check.
    const m = lc.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (m) return isPrivateIp(m[1])
  }
  return false
}

// Resolve a hostname (or accept an IP literal) and confirm every address is
// public. Throws on any private/internal target. DNS-failure also throws.
async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new Error('blocked host')
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error('blocked ip')
    return
  }
  const addrs = await lookup(host, { all: true })
  if (addrs.length === 0) throw new Error('no address')
  for (const { address } of addrs) {
    if (isPrivateIp(address)) throw new Error('blocked resolved ip')
  }
}

function boardFromHost(host: string): string | null {
  if (host.includes('greenhouse')) return 'greenhouse'
  if (host.includes('lever')) return 'lever'
  if (host.includes('ashby')) return 'ashby'
  if (host.includes('workable')) return 'workable'
  return null
}

// Pull the first schema.org JobPosting out of any ld+json blocks.
function fromJsonLd(html: string): { role: string | null; company: string | null } | null {
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )
  for (const m of blocks) {
    try {
      const json = JSON.parse(m[1].trim())
      const candidates = Array.isArray(json) ? json : [json, ...(json['@graph'] ?? [])]
      for (const node of candidates) {
        if (node && node['@type'] === 'JobPosting') {
          const company =
            typeof node.hiringOrganization === 'string'
              ? node.hiringOrganization
              : node.hiringOrganization?.name ?? null
          return { role: node.title ?? null, company: company ?? null }
        }
      }
    } catch {
      // Malformed JSON-LD — skip and try the next block / fallback.
    }
  }
  return null
}

function metaContent(html: string, key: string): string | null {
  // Matches <meta property="og:title" content="..."> in either attr order.
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']|` +
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`,
    'i'
  )
  const m = html.match(re)
  return m ? (m[1] ?? m[2] ?? null) : null
}

function decode(s: string | null): string | null {
  if (!s) return s
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

export async function GET(req: Request): Promise<Response> {
  const target = new URL(req.url).searchParams.get('url')
  const empty: JobDetails = { company: null, role: null, board: null, source: 'none' }

  if (!target) return Response.json(empty, { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return Response.json(empty, { status: 400 })
  }

  // SSRF guard: http(s) only.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return Response.json(empty, { status: 422 })
  }

  const board = boardFromHost(parsed.hostname)

  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS)

    // Follow redirects manually so we re-validate the host on every hop — a
    // public page must not be able to bounce us onto an internal address.
    let current = parsed
    let res!: Response
    let hops = 0
    try {
      while (true) {
        await assertPublicHost(current.hostname)
        res = await fetch(current.toString(), {
          signal: ac.signal,
          headers: { 'user-agent': 'JobberyBot/0.1 (+job-tracker)' },
          redirect: 'manual',
        })
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
          if (++hops > MAX_REDIRECTS) throw new Error('too many redirects')
          current = new URL(res.headers.get('location')!, current)
          if (current.protocol !== 'https:' && current.protocol !== 'http:') {
            throw new Error('blocked redirect scheme')
          }
          continue
        }
        break
      }
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) return Response.json({ ...empty, board }, { status: 200 })

    // Read at most MAX_BYTES — metadata is near the top of the document.
    const buf = await res.arrayBuffer()
    const html = new TextDecoder().decode(buf.slice(0, MAX_BYTES))

    const ld = fromJsonLd(html)
    const role = decode(ld?.role ?? metaContent(html, 'og:title'))
    // Greenhouse (and others) often ship no hiringOrganization / og:site_name.
    // Fall back to the company slug in the URL path so we still name the company.
    const company =
      decode(ld?.company ?? metaContent(html, 'og:site_name')) ??
      parseJobUrl(parsed.toString()).company

    const details: JobDetails = {
      company,
      role,
      board,
      source: role || company ? 'metadata' : 'none',
    }
    return Response.json(details, { status: 200 })
  } catch {
    // Timeout / network error — let the client fall back to its regex guess.
    return Response.json({ ...empty, board }, { status: 200 })
  }
}
