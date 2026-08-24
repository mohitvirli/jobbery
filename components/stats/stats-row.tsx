'use client'

// Three momentum metrics: current streak, this-week vs target, lifetime total.
// Computed from the applications array via computeStats (lib/stats) so this
// component stays presentational — and so the MCP server, which calls the same
// composer, can never report numbers that disagree with this row.
//
// Motivation layers on top of the raw counts:
//   - Current streak shows a "Best N" personal best to chase.
//   - This-week shows a progress bar toward the weekly target.
//   - A loss-aversion nudge surfaces when the streak is alive but today is empty.

import { useMemo } from 'react'
import { Flame, Target } from 'lucide-react'
import { computeStats } from '@/lib/stats'
import type { Application } from '@/lib/types'
import { useSettings } from '@/hooks/use-settings'

function Stat({
  value,
  label,
  accent,
  footer,
}: {
  value: React.ReactNode
  label: string
  accent?: boolean
  footer?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card px-5 py-4">
      <span
        className="text-2xl font-bold tabular-nums tracking-tight"
        data-accent={accent || undefined}
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
      {footer}
    </div>
  )
}

export function StatsRow({ applications }: { applications: Application[] }) {
  const {
    settings: { weeklyTarget },
  } = useSettings()
  // No timeZone argument: in the browser the process zone already IS the user's.
  const {
    currentStreak: streak,
    longestStreak: best,
    thisWeekCount: week,
    openCount: open,
    applyToday: today,
    streakAtRisk: atRisk,
    total,
  } = useMemo(
    () => computeStats(applications, weeklyTarget),
    [applications, weeklyTarget]
  )

  const weekPct = Math.min(100, weeklyTarget > 0 ? (week / weeklyTarget) * 100 : 0)
  const weekHit = week >= weeklyTarget
  // Can only apply to roles already queued — bound the daily push by the open
  // backlog. With nothing queued, the nudge flips to "add roles".
  const toApplyNow = Math.min(today, open)
  const behind = today > 0

  return (
    <div className="flex flex-col gap-3">
      {atRisk && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-2.5 text-sm">
          <Flame className="size-4 shrink-0 text-success" />
          <span>
            Apply once to keep your{' '}
            <span className="font-semibold tabular-nums">{streak}-day</span> streak
            alive.
          </span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat
          accent={streak > 0}
          value={
            <span>
              {streak}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                {streak === 1 ? 'day' : 'days'}
              </span>
            </span>
          }
          label="Streak"
          footer={
            best > 0 ? (
              <span className="text-xs text-muted-foreground">
                Best <span className="tabular-nums">{best}</span>
              </span>
            ) : undefined
          }
        />
        <Stat
          accent={weekHit}
          value={
            <span>
              {week}
              <span className="text-sm font-normal text-muted-foreground">
                {' '}
                / {weeklyTarget}
              </span>
            </span>
          }
          label="This week"
          footer={
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success transition-[width]"
                style={{ width: `${weekPct}%` }}
              />
            </div>
          }
        />
        <Stat value={open} label="Open" />
      </div>

      {/* Daily pace banner — inferred from the open backlog. Accented when
          there's something to do (behind pace), quiet when caught up, and an
          onboarding prompt before any roles exist. */}
      <div
        className={
          'flex items-center gap-3 rounded-xl border bg-card px-5 py-3.5' +
          (behind && total > 0 ? ' border-success/40' : '')
        }
      >
        <Target className="size-5 shrink-0 text-success" />
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add your first role to start tracking.
          </p>
        ) : !behind ? (
          <p className="text-sm text-muted-foreground">
            {weekHit ? 'Weekly target met.' : 'On track for today.'}
          </p>
        ) : open === 0 ? (
          <p className="text-sm">
            No open roles — add some to keep your pace.
          </p>
        ) : (
          <p className="text-sm">
            Apply{' '}
            <span className="font-semibold tabular-nums text-success">
              {toApplyNow}
            </span>{' '}
            {toApplyNow === 1 ? 'role' : 'roles'} today to stay on pace.
          </p>
        )}
      </div>
    </div>
  )
}
