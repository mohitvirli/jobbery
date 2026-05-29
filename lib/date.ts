// Date helpers — streak calc, week math, heatmap grid, relative time.
// All day-bucketing uses LOCAL time so "today" matches the user's clock, not UTC.

import type { Application } from './types'

// Week starts Monday (ISO). Change here to shift the whole app's week boundary.
const WEEK_STARTS_ON = 1 // 0=Sun, 1=Mon

// Local YYYY-MM-DD key. Used to bucket applications into calendar days.
export function toDayKey(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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
export function countByDay(apps: Application[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const a of apps) {
    const k = toDayKey(a.appliedAt)
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
export function currentStreak(apps: Application[]): number {
  const counts = countByDay(appliedOnly(apps))
  if (counts.size === 0) return 0
  const today = startOfDay(new Date())

  // If neither today nor yesterday has a log, streak is 0.
  const hasToday = (counts.get(toDayKey(today)) ?? 0) > 0
  const startFrom = hasToday ? today : addDays(today, -1)
  if ((counts.get(toDayKey(startFrom)) ?? 0) === 0) return 0

  let streak = 0
  let cursor = startFrom
  while ((counts.get(toDayKey(cursor)) ?? 0) > 0) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

// Longest run of consecutive ≥1-application days anywhere in history.
// Gives the user a personal best to chase past the current streak.
export function longestStreak(apps: Application[]): number {
  // Sorted unique day timestamps (local midnight) of applied days.
  const days = [...countByDay(appliedOnly(apps)).keys()]
    .map((k) => startOfDay(new Date(k)).getTime())
    .sort((a, b) => a - b)
  if (days.length === 0) return 0

  const DAY = 86_400_000
  let best = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    run = days[i] - days[i - 1] === DAY ? run + 1 : 1
    if (run > best) best = run
  }
  return best
}

// Applications applied today (local).
export function todayCount(apps: Application[]): number {
  const key = toDayKey(new Date())
  return countByDay(appliedOnly(apps)).get(key) ?? 0
}

// Streak alive (≥1) but nothing logged today yet → one more keeps it.
// Drives the loss-aversion nudge.
export function streakAtRisk(apps: Application[]): boolean {
  return currentStreak(apps) > 0 && todayCount(apps) === 0
}

// How many more to apply TODAY to stay on pace for the weekly target.
// Spreads the week's remaining target evenly across the days left (incl today),
// then subtracts what's already applied today. 0 = done for today / target met.
export function applyToday(apps: Application[], weeklyTarget: number): number {
  const remaining = Math.max(0, weeklyTarget - thisWeekCount(apps))
  if (remaining === 0) return 0
  const todayIdx = (startOfDay(new Date()).getDay() - WEEK_STARTS_ON + 7) % 7
  const daysLeft = 7 - todayIdx // includes today
  const perDay = Math.ceil(remaining / daysLeft)
  return Math.max(0, perDay - todayCount(apps))
}

// Count of applications in the current week (since week start).
export function thisWeekCount(apps: Application[]): number {
  const weekStart = startOfWeek(new Date()).getTime()
  return appliedOnly(apps).filter(
    (a) => new Date(a.appliedAt).getTime() >= weekStart
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
