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

export function Dashboard() {
  const { applications, loading, add, setStatus } = useApplications()

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
    <div className="flex flex-col gap-8">
      <Heatmap applications={applications} />
      <StatsRow applications={applications} />
      <QuickAdd onAdd={add} />
      <Timeline applications={applications} onSetStatus={setStatus} />
    </div>
  )
}
