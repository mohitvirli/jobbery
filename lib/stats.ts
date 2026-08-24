// The momentum snapshot — one composer over the pure helpers in lib/date.
//
// This exists so the dashboard and the MCP server can't drift. Both derive the
// same nine numbers from the same code path; the only difference is that the
// browser omits `timeZone` (local already IS the user's zone) while the MCP
// route passes the zone stored on the user's settings row, because a Vercel
// function's local time is UTC.

import {
  applyToday,
  currentStreak,
  longestStreak,
  openCount,
  streakAtRisk,
  thisWeekCount,
  todayCount,
  appliedOnly,
} from './date'
import type { Application } from './types'

export type JobberyStats = {
  currentStreak: number
  longestStreak: number
  todayCount: number
  thisWeekCount: number
  weeklyTarget: number
  applyToday: number
  streakAtRisk: boolean
  total: number // every row tracked, queued or submitted
  appliedTotal: number // lifetime submissions — what the streak/heatmap credit
  openCount: number // 'to_apply' backlog
}

export function computeStats(
  apps: Application[],
  weeklyTarget: number,
  timeZone?: string
): JobberyStats {
  return {
    currentStreak: currentStreak(apps, timeZone),
    longestStreak: longestStreak(apps, timeZone),
    todayCount: todayCount(apps, timeZone),
    thisWeekCount: thisWeekCount(apps, timeZone),
    weeklyTarget,
    applyToday: applyToday(apps, weeklyTarget, timeZone),
    streakAtRisk: streakAtRisk(apps, timeZone),
    total: apps.length,
    appliedTotal: appliedOnly(apps).length,
    openCount: openCount(apps),
  }
}
