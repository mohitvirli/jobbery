'use client'

// The single screen, composed. Owns the application data via useApplications and
// passes it down. Client component because everything here is interactive and
// reads localStorage; the route/page stays a thin server entry.

import { useApplications } from '@/hooks/use-applications'
import { Heatmap } from '@/components/heatmap/heatmap'
import { StatsRow } from '@/components/stats/stats-row'
import { QuickAdd } from '@/components/quick-add/quick-add'
import { Timeline } from '@/components/timeline/timeline'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingsDialog } from '@/components/settings-dialog'

export function Dashboard() {
  const { applications, loading, add, setStatus, remove } = useApplications()

  // Pre-hydration: localStorage isn't readable on the server, so show a
  // skeleton until the client reads it. Prevents a flash of empty state.
  if (loading) {
    return (
      <div className="flex flex-col gap-8">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    )
  }

  return (
    // Mobile: single stacked column (summary → capture → feed).
    // Desktop (lg+): two columns. Left (wider, 3fr) = capture + timeline;
    // right (narrower, 2fr, sticky) = heatmap + stats. order-* keeps the
    // mobile order (summary first) while swapping sides on desktop.
    // Desktop: full-bleed viewport grid (edge to edge). Left column holds the
    // header, pinned quick-add, and the only scrolling region (timeline). Right
    // column is the activity panel — its background bleeds to the top and the
    // right edge of the viewport.
    // Desktop centering: the grid is capped to a max-width and centered with
    // mx-auto, so content never drifts on ultrawide. The right panel's muted bg
    // bleeds to the top + right viewport edge via a pseudo-element
    // (before:-right-[100vw]) — the element layout stays inside the centered
    // grid, but the painted background escapes to the edge. This avoids the old
    // calc-padding trick, which crushed the fixed-width right column on wide
    // screens (the padding grew larger than the column).
    <div className="flex flex-col gap-8 lg:relative lg:mx-auto lg:grid lg:h-dvh lg:min-h-0 lg:w-full lg:max-w-[76rem] lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-0 lg:px-8">
      {/* Desktop header: full-width overlay bar, transparent so the right
          panel's muted bg shows behind it and still bleeds to the very top.
          Brand on the left (aligned to the input), theme toggle pinned to the
          right edge (aligned to the stats). inset-x-8 matches the grid's px-8 so
          edges line up with the content. Mobile header lives in the route layout. */}
      <header className="hidden lg:absolute lg:inset-x-8 lg:top-0 lg:z-20 lg:flex lg:h-20 lg:items-center lg:justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-mono text-lg font-semibold tracking-tight">
            <span className="text-muted-foreground">[</span>
            jobbery
            <span className="text-muted-foreground">]</span>
          </h1>
          <span className="text-[10px] text-muted-foreground">keep the streak</span>
        </div>
        <SettingsDialog />
      </header>
      {/* LEFT (wider): quick-add pinned, timeline scrolls below. pt-20 clears
          the overlay header so the input aligns with the right panel content. */}
      <div className="order-2 flex min-w-0 flex-col gap-8 lg:order-1 lg:min-h-0 lg:overflow-hidden lg:pb-8 lg:pr-12 lg:pt-20">
        <div className="lg:shrink-0">
          <QuickAdd onAdd={add} />
        </div>
        <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <Timeline
            applications={applications}
            onSetStatus={setStatus}
            onDelete={remove}
          />
        </div>
      </div>
      {/* RIGHT (narrower): activity summary, pinned. Background bleeds to the
          top + right edge of the viewport (no rounding/inset). */}
      <div className="relative order-1 flex flex-col gap-6 lg:order-2 lg:min-h-0 lg:gap-0 lg:before:absolute lg:before:inset-y-0 lg:before:left-0 lg:before:-right-[100vw] lg:before:-z-10 lg:before:bg-muted/40">
        {/* Scroll lives on an inner wrapper, not the bg element. overflow-y:auto
            forces overflow-x to clip, which would crop the bleeding bg pseudo —
            so the pseudo stays on the outer (overflow-visible) box and only the
            inner content scrolls. */}
        <div className="flex flex-col gap-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-8 lg:pl-8 lg:pt-20">
          <Heatmap applications={applications} />
          <StatsRow applications={applications} />
        </div>
      </div>
    </div>
  )
}
