'use client'

// Three momentum metrics: current streak, this-week vs target, lifetime total.
// Computed from the applications array (pure functions in lib/date) so this
// component stays presentational.

import { useMemo } from 'react'
import { currentStreak, thisWeekCount } from '@/lib/date'
import type { Application } from '@/lib/types'

const WEEKLY_TARGET = 5 // default goal; v1 will make this user-configurable

function Stat({
  value,
  label,
  accent,
}: {
  value: React.ReactNode
  label: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card px-5 py-4">
      <span
        className="text-2xl font-semibold tabular-nums tracking-tight"
        data-accent={accent || undefined}
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

export function StatsRow({ applications }: { applications: Application[] }) {
  const { streak, week, total } = useMemo(
    () => ({
      streak: currentStreak(applications),
      week: thisWeekCount(applications),
      total: applications.length,
    }),
    [applications]
  )

  return (
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
        label="Current streak"
      />
      <Stat
        value={
          <span>
            {week}
            <span className="text-sm font-normal text-muted-foreground">
              {' '}
              / {WEEKLY_TARGET}
            </span>
          </span>
        }
        label="This week"
      />
      <Stat value={total} label="Total applications" />
    </div>
  )
}
