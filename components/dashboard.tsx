'use client'

// The single screen, composed. Owns the application data via useApplications and
// passes it down. Client component because everything here is interactive and
// reads localStorage; the route/page stays a thin server entry.

import { useEffect, useMemo, useState } from 'react'
import { useApplications } from '@/hooks/use-applications'
import { Heatmap } from '@/components/heatmap/heatmap'
import { StatsRow } from '@/components/stats/stats-row'
import { QuickAdd } from '@/components/quick-add/quick-add'
import { Timeline } from '@/components/timeline/timeline'
import {
  ActiveFilters,
  TimelineToolbar,
} from '@/components/timeline/timeline-filters'
import {
  EMPTY_FILTER,
  filterApplications,
  filterFromSearchParams,
  filterToSearchParams,
  isFilterActive,
} from '@/lib/filter'
import { allTags } from '@/lib/tags'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingsDialog } from '@/components/settings-dialog'
import { LoginCta } from '@/components/login-cta'

export function Dashboard() {
  const { applications, loading, add, setStatus, setTags, remove } = useApplications()

  // Filter state lives here rather than inside Timeline because the split
  // matters: only the timeline gets the narrowed list. Heatmap and StatsRow
  // keep the full one — they report overall momentum, and having a search for
  // "acme" quietly rewrite your streak would be a lie.
  //
  // Seeded from the query string so a reload keeps the view. Reading
  // window.location directly (rather than useSearchParams) keeps this out of
  // Next's router: no Suspense boundary to add, and no re-render per keystroke.
  // Safe against hydration mismatch because the only thing rendered before the
  // first effect runs is the loading skeleton, which ignores the filter.
  const [filter, setFilter] = useState(() =>
    typeof window === 'undefined'
      ? EMPTY_FILTER
      : filterFromSearchParams(window.location.search)
  )

  // Mirror the filter back into the URL. replaceState, not pushState: typing a
  // six-character search would otherwise bury the previous page under six
  // history entries.
  useEffect(() => {
    const query = filterToSearchParams(filter)
    window.history.replaceState(
      null,
      '',
      query ? `${window.location.pathname}?${query}` : window.location.pathname
    )
  }, [filter])
  const visible = useMemo(
    () => filterApplications(applications, filter),
    [applications, filter]
  )
  const tagOptions = useMemo(() => allTags(applications), [applications])
  const filtering = isFilterActive(filter)

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
      {/* The header mirrors the page grid (same columns, same px-8) rather than
          being one flex row, so its left cell ends exactly where the timeline
          column ends. That's what keeps the search pinned to the right edge of
          the timeline instead of drifting out over the activity panel. pr-12
          matches the content column's own padding, so the icon lines up with
          the right edge of the quick-add field below it. */}
      <header className="hidden lg:absolute lg:inset-x-8 lg:top-0 lg:z-20 lg:grid lg:h-20 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="flex items-center justify-between pr-12">
          <div className="flex flex-col gap-0.5">
            <h1 className="font-mono text-lg font-semibold tracking-tight">
              <span className="text-muted-foreground">[</span>
              jobbery
              <span className="text-muted-foreground">]</span>
            </h1>
            <span className="text-xs text-muted-foreground">keep the streak</span>
          </div>
          {applications.length > 0 && (
            <TimelineToolbar
              filter={filter}
              onChange={setFilter}
              tagOptions={tagOptions}
              // The header instance owns '/' — it's the one on a device with a
              // keyboard, and only one listener may claim the key.
              enableShortcut
            />
          )}
        </div>
        <div className="flex items-center justify-end gap-2 pl-8">
          <LoginCta />
          <SettingsDialog />
        </div>
      </header>
      {/* LEFT (wider): quick-add pinned, timeline scrolls below. pt-20 clears
          the overlay header so the input aligns with the right panel content. */}
      <div className="order-2 flex min-w-0 flex-col gap-8 lg:order-1 lg:min-h-0 lg:overflow-hidden lg:pb-8 lg:pr-12 lg:pt-20">
        {/* Pinned: capture on top, then the filter state. Both stay put while
            the timeline below them scrolls — a chip line explaining why the
            list is short is useless if it scrolls away with it.

            The toolbar itself is header-mounted on desktop; on mobile the
            header lives in the route layout, out of reach of this state, so a
            second instance renders here instead. Only one is ever visible. */}
        <div className="flex flex-col gap-4 lg:shrink-0">
          <QuickAdd onAdd={add} />
          {applications.length > 0 && (
            <TimelineToolbar
              filter={filter}
              onChange={setFilter}
              tagOptions={tagOptions}
              // justify-end mirrors the desktop header, where the search sits
              // at the right edge of the timeline column.
              className="justify-end lg:hidden"
            />
          )}
          <ActiveFilters
            filter={filter}
            onChange={setFilter}
            matchCount={visible.length}
            totalCount={applications.length}
          />
        </div>
        <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <Timeline
            applications={visible}
            tagSuggestions={tagOptions}
            filtered={filtering}
            onClearFilters={() => setFilter(EMPTY_FILTER)}
            onSetStatus={setStatus}
            onSetTags={setTags}
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
