'use client'

// GitHub-style contribution heatmap — the hero element. Last 12 weeks, each cell
// = one day, 5 intensity levels. Colors come from CSS custom properties
// (--heat-0..--heat-4) defined in globals.css so the visual layer is themeable
// without touching this component.

import { useMemo } from 'react'
import { buildHeatmap, appliedOnly } from '@/lib/date'
import type { Application } from '@/lib/types'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const WEEKS = 26 // ~6 months; enough columns that square cells fill the width
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''] // sparse, GitHub-style

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function Heatmap({ applications }: { applications: Application[] }) {
  const grid = useMemo(() => buildHeatmap(applications, WEEKS), [applications])
  const totalApplied = useMemo(
    () => appliedOnly(applications).length,
    [applications]
  )

  return (
    <TooltipProvider delay={120} closeDelay={0}>
    <section aria-label="Application activity" className="w-full">
      <div className="flex gap-2">
        {/* Day-of-week labels — flex-1 rows track the cell heights */}
        <div className="flex flex-col gap-[3px]">
          {DAY_LABELS.map((label, i) => (
            <div
              key={i}
              className="flex flex-1 items-center text-[10px] text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Week columns — flex-1 each so the grid fills the container width */}
        <div className="flex flex-1 gap-[3px]">
          {grid.map((week, wi) => (
            <div key={wi} className="flex flex-1 flex-col gap-[3px]">
              {week.map((cell) => (
                <Tooltip key={cell.dayKey}>
                  <TooltipTrigger
                    render={
                      <div
                        data-level={cell.level}
                        data-future={cell.inFuture || undefined}
                        className="heat-cell aspect-square w-full rounded-[3px]"
                      />
                    }
                  />
                  <TooltipContent>
                    {cell.inFuture ? (
                      <span>{formatDate(cell.date)}</span>
                    ) : (
                      <span>
                        {cell.count} application{cell.count === 1 ? '' : 's'} ·{' '}
                        {formatDate(cell.date)}
                      </span>
                    )}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend + total applied (bottom-right). */}
      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((lvl) => (
          <div
            key={lvl}
            data-level={lvl}
            className="heat-cell h-[12px] w-[12px] rounded-[3px]"
          />
        ))}
        <span>More</span>
        <span className="ml-auto text-foreground">
          <span className="font-semibold tabular-nums">{totalApplied}</span> applied
        </span>
      </div>
    </section>
    </TooltipProvider>
  )
}
