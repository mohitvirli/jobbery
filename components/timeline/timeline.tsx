'use client'

// Reverse-chronological timeline of logged applications, bucketed into date
// groups (Today / Yesterday / This week / Earlier). A vertical rail with a node
// per entry runs down the left of each group. Each row: company, role, relative
// time, status, optional JD link. A row can flip between 'To apply' and
// 'Applied'; flipping to Applied re-stamps the date (handled in the hook), so the
// heatmap credits the day you applied.
// Framer `layout` + fade/slide so new and re-ordered rows animate.

import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import { relativeTime, startOfDay, startOfWeek, addDays } from '@/lib/date'
import type { Application, ApplicationStatus } from '@/lib/types'
import { Checkbox } from '@/components/ui/checkbox'
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty'

function Row({
  app,
  onSetStatus,
}: {
  app: Application
  onSetStatus: (id: string, status: ApplicationStatus) => void
}) {
  const isToApply = app.status === 'to_apply'

  // Whole row opens the posting (if any). The checkbox stops propagation so
  // toggling status never triggers the navigation.
  function openPosting() {
    if (app.url) window.open(app.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
      data-status={app.status}
    >
      <div
        role={app.url ? 'link' : undefined}
        tabIndex={app.url ? 0 : undefined}
        onClick={openPosting}
        onKeyDown={(e) => {
          if (app.url && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            openPosting()
          }
        }}
        className={
          'group relative flex items-center gap-3 rounded-lg py-3 pr-2 transition-colors' +
          (app.url ? ' cursor-pointer hover:bg-accent' : '')
        }
      >
        {/* Rail node = the checkbox. Sits above the continuous rail line (drawn
            on the <ul>). No backing ring — the line runs unbroken behind every
            node; on hover the transparent backing reveals the full line.
            Toggling re-stamps the date. */}
        <span
          className="relative z-10 flex w-5 shrink-0 items-center justify-center"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <span className="rounded-md">
            <Checkbox
              checked={!isToApply}
              onCheckedChange={(checked) =>
                onSetStatus(app.id, checked ? 'applied' : 'to_apply')
              }
              aria-label={isToApply ? 'Mark applied' : 'Move back to To apply'}
            />
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <span
              className={
                'shrink-0 font-medium decoration-1 underline-offset-2' +
                (isToApply ? ' text-muted-foreground' : ' line-through opacity-70') +
                (app.url ? ' group-hover:underline' : '')
              }
            >
              {app.company}
            </span>
            {app.role && (
              <span
                className={
                  'min-w-0 truncate text-sm text-muted-foreground decoration-1 underline-offset-2' +
                  (isToApply ? '' : ' line-through') +
                  (app.url ? ' group-hover:underline' : '')
                }
              >
                {app.role}
              </span>
            )}
          </div>
        </div>

        {/* Relative time, swapped for an open-link affordance on hover. */}
        {app.url ? (
          <span className="relative shrink-0">
            <time
              className="text-xs tabular-nums text-muted-foreground group-hover:opacity-0"
              dateTime={app.appliedAt}
              title={new Date(app.appliedAt).toLocaleString()}
            >
              {relativeTime(app.appliedAt)}
            </time>
            <ExternalLink
              aria-hidden
              className="absolute right-0 top-1/2 size-4 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            />
          </span>
        ) : (
          <time
            className="shrink-0 text-xs tabular-nums text-muted-foreground"
            dateTime={app.appliedAt}
            title={new Date(app.appliedAt).toLocaleString()}
          >
            {relativeTime(app.appliedAt)}
          </time>
        )}
      </div>
    </motion.li>
  )
}

// Chronological buckets, newest first. Applications arrive already sorted
// newest-first from the hook, so per-bucket order is preserved by a plain filter.
const BUCKETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This week' },
  { key: 'earlier', label: 'Earlier' },
] as const

function bucketOf(iso: string): (typeof BUCKETS)[number]['key'] {
  const d = startOfDay(new Date(iso)).getTime()
  const today = startOfDay(new Date()).getTime()
  const yesterday = startOfDay(addDays(new Date(), -1)).getTime()
  const weekStart = startOfWeek(new Date()).getTime()
  if (d >= today) return 'today'
  if (d >= yesterday) return 'yesterday'
  if (d >= weekStart) return 'week'
  return 'earlier'
}

export function Timeline({
  applications,
  onSetStatus,
}: {
  applications: Application[]
  onSetStatus: (id: string, status: ApplicationStatus) => void
}) {
  if (applications.length === 0) {
    return (
      <Empty className="rounded-2xl border border-dashed">
        <EmptyTitle>No applications yet</EmptyTitle>
        <EmptyDescription>
          Paste a job link above to log your first one.
        </EmptyDescription>
      </Empty>
    )
  }

  const groups = BUCKETS.map((b) => ({
    ...b,
    items: applications.filter((a) => bucketOf(a.appliedAt) === b.key),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="relative flex flex-col gap-5">
      {/* One continuous rail line spanning the whole timeline — across date
          groups, not just within them. x = gutter (w-14=56px) + gap-3 (12px) +
          node offset (10px) = 78px. Runs from first node center (~22px from
          top) to last node center (~22px from bottom). */}
      <span
        aria-hidden
        className="absolute left-[78px] top-[22px] bottom-[22px] w-0.5 -translate-x-1/2 bg-muted-foreground/30"
      />
      {groups.map((group) => (
        <section key={group.key} className="flex gap-3">
          {/* Date-group label as a small box to the left of the rows */}
          <div className="w-14 shrink-0 pt-3">
            <span className="inline-block rounded border bg-muted px-1 py-px text-[9px] font-medium whitespace-nowrap text-muted-foreground">
              {group.label}
            </span>
          </div>
          <ul className="flex min-w-0 flex-1 flex-col">
            <AnimatePresence initial={false}>
              {group.items.map((app) => (
                <Row key={app.id} app={app} onSetStatus={onSetStatus} />
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}
    </div>
  )
}
