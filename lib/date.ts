// Date helpers — streak calc, week math, heatmap grid, relative time.
//
// All day-bucketing defaults to LOCAL time so "today" matches the user's clock,
// not UTC. Every analytics helper also accepts an optional IANA `timeZone`:
// in the browser local IS the user's zone, but the MCP server runs in a Vercel
// function where local is UTC, so it must pass the user's stored zone explicitly
// or its streaks would disagree with what the dashboard shows.
//
// The analytics helpers do their day arithmetic in day-KEY space (YYYY-MM-DD
// strings) rather than by walking Date objects. A calendar date has no offset,
// so key math is immune to DST shifts and to the process's own zone.

import type { Application } from './types'

// Week starts Monday (ISO). Change here to shift the whole app's week boundary.
const WEEK_STARTS_ON = 1 // 0=Sun, 1=Mon

// YYYY-MM-DD key for the calendar day `input` falls on. Used to bucket
// applications into days. Omit `timeZone` for the process's local zone.
export function toDayKey(input: Date | string, timeZone?: string): string {
  const d = typeof input === 'string' ? new Date(input) : input
  if (timeZone) {
    // en-CA formats as YYYY-MM-DD, which is exactly the key shape we want.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  }
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// --- day-key arithmetic ----------------------------------------------------
// A day key is a bare calendar date. We anchor it to UTC midnight purely to
// borrow Date's calendar math, then read it back with the UTC getters — the
// value never leaves key space, so no zone or DST rule can perturb it.

const DAY_MS = 86_400_000

function dayKeyToUtc(key: string): number {
  return Date.parse(`${key}T00:00:00Z`)
}

function utcToDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

// The day key `n` days after `key` (negative walks backwards).
export function shiftDayKey(key: string, n: number): string {
  return utcToDayKey(dayKeyToUtc(key) + n * DAY_MS)
}

// Day of week for a day key, 0=Sun…6=Sat — matching Date#getDay's numbering.
function dayKeyWeekday(key: string): number {
  return new Date(dayKeyToUtc(key)).getUTCDay()
}

// Day key of the week start (per WEEK_STARTS_ON) for the week containing `key`.
function weekStartKey(key: string): string {
  return shiftDayKey(key, -((dayKeyWeekday(key) - WEEK_STARTS_ON + 7) % 7))
}

// Midnight (local) of the given date.
export function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

// Start of the week containing `d`, respecting WEEK_STARTS_ON.
export function startOfWeek(d: Date): Date {
  const c = startOfDay(d)
  const diff = (c.getDay() - WEEK_STARTS_ON + 7) % 7
  c.setDate(c.getDate() - diff)
  return c
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}

// Only 'applied' (completed) rows count toward momentum analytics. A saved
// 'to_apply' row is a queued intent, not a submission, so it must not credit
// the streak, heatmap, weekly count, or total.
export function appliedOnly(apps: Application[]): Application[] {
  return apps.filter((a) => a.status === 'applied')
}

// Count of open (queued, not-yet-applied) rows — the backlog to work through.
export function openCount(apps: Application[]): number {
  return apps.filter((a) => a.status === 'to_apply').length
}

// Map of dayKey -> application count.
export function countByDay(
  apps: Application[],
  timeZone?: string
): Map<string, number> {
  const m = new Map<string, number>()
  for (const a of apps) {
    const k = toDayKey(a.appliedAt, timeZone)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

// 0–4 intensity bucket for a day's count (GitHub-style 5 levels).
export function intensityLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count === 2) return 2
  if (count <= 4) return 3
  return 4
}

export type HeatmapCell = {
  date: Date
  dayKey: string
  count: number
  level: 0 | 1 | 2 | 3 | 4
  inFuture: boolean
}

// Build a weeks×7 grid for the last `weeks` weeks, ending with the current week.
// Columns = weeks (oldest→newest), each column = 7 day cells (week-start→end).
export function buildHeatmap(apps: Application[], weeks = 12): HeatmapCell[][] {
  const counts = countByDay(appliedOnly(apps))
  const today = startOfDay(new Date())
  const thisWeekStart = startOfWeek(today)
  const firstWeekStart = addDays(thisWeekStart, -(weeks - 1) * 7)

  const grid: HeatmapCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: HeatmapCell[] = []
    const weekStart = addDays(firstWeekStart, w * 7)
    for (let dow = 0; dow < 7; dow++) {
      const date = addDays(weekStart, dow)
      const dayKey = toDayKey(date)
      const count = counts.get(dayKey) ?? 0
      col.push({
        date,
        dayKey,
        count,
        level: intensityLevel(count),
        inFuture: date.getTime() > today.getTime(),
      })
    }
    grid.push(col)
  }
  return grid
}

// Current streak = consecutive days (ending today or yesterday) with ≥1 application.
// Yesterday counts as still-alive so the streak doesn't "break" before today's first log.
export function currentStreak(apps: Application[], timeZone?: string): number {
  const counts = countByDay(appliedOnly(apps), timeZone)
  if (counts.size === 0) return 0
  const todayKey = toDayKey(new Date(), timeZone)

  // If neither today nor yesterday has a log, streak is 0.
  const hasToday = (counts.get(todayKey) ?? 0) > 0
  const startFrom = hasToday ? todayKey : shiftDayKey(todayKey, -1)
  if ((counts.get(startFrom) ?? 0) === 0) return 0

  let streak = 0
  let cursor = startFrom
  while ((counts.get(cursor) ?? 0) > 0) {
    streak++
    cursor = shiftDayKey(cursor, -1)
  }
  return streak
}

// Longest run of consecutive ≥1-application days anywhere in history.
// Gives the user a personal best to chase past the current streak.
export function longestStreak(apps: Application[], timeZone?: string): number {
  // Sorted unique day keys of applied days. Lexicographic order on YYYY-MM-DD
  // is chronological order, so a plain string sort is correct here.
  const days = [...countByDay(appliedOnly(apps), timeZone).keys()].sort()
  if (days.length === 0) return 0

  let best = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    run = shiftDayKey(days[i - 1], 1) === days[i] ? run + 1 : 1
    if (run > best) best = run
  }
  return best
}

// Applications applied today.
export function todayCount(apps: Application[], timeZone?: string): number {
  const key = toDayKey(new Date(), timeZone)
  return countByDay(appliedOnly(apps), timeZone).get(key) ?? 0
}

// Streak alive (≥1) but nothing logged today yet → one more keeps it.
// Drives the loss-aversion nudge.
export function streakAtRisk(apps: Application[], timeZone?: string): boolean {
  return currentStreak(apps, timeZone) > 0 && todayCount(apps, timeZone) === 0
}

// How many more to apply TODAY to stay on pace for the weekly target.
// Spreads the week's remaining target evenly across the days left (incl today),
// then subtracts what's already applied today. 0 = done for today / target met.
export function applyToday(
  apps: Application[],
  weeklyTarget: number,
  timeZone?: string
): number {
  const remaining = Math.max(0, weeklyTarget - thisWeekCount(apps, timeZone))
  if (remaining === 0) return 0
  const todayKey = toDayKey(new Date(), timeZone)
  const todayIdx = (dayKeyWeekday(todayKey) - WEEK_STARTS_ON + 7) % 7
  const daysLeft = 7 - todayIdx // includes today
  const perDay = Math.ceil(remaining / daysLeft)
  return Math.max(0, perDay - todayCount(apps, timeZone))
}

// Count of applications in the current week (since week start).
export function thisWeekCount(apps: Application[], timeZone?: string): number {
  const start = weekStartKey(toDayKey(new Date(), timeZone))
  return appliedOnly(apps).filter(
    (a) => toDayKey(a.appliedAt, timeZone) >= start
  ).length
}

// "2h ago", "3d ago", "just now". Compact relative time for the timeline.
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const sec = Math.floor(diff / 1000)
  if (sec < 45) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `${wk}w ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(day / 365)}y ago`
}
