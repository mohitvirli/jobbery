'use client'

// Reverse-chronological timeline of logged applications, bucketed into date
// groups (Today / Yesterday / then one group per calendar day). A vertical rail with a node
// per entry runs down the left of each group. Each row: company, role, relative
// time, status, optional JD link. A row can flip between 'To apply' and
// 'Applied'; flipping to Applied re-stamps the date (handled in the hook), so the
// heatmap credits the day you applied.
// Framer `layout` + fade/slide so new and re-ordered rows animate.

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink, Trash2 } from 'lucide-react'
import { relativeTime, startOfDay, addDays, toDayKey } from '@/lib/date'
import type { Application, ApplicationStatus } from '@/lib/types'
import { Checkbox } from '@/components/ui/checkbox'
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty'

// Text with an animated strikethrough that draws left→right when `struck`
// flips true (and retracts right→left when un-checked). We animate a 1px line
// over the text instead of CSS `line-through` so the strike is directional.
function StrikeText({
  struck,
  className,
  children,
}: {
  struck: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <span className={'relative' + (className ? ' ' + className : '')}>
      {children}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute left-0 top-1/2 h-px -translate-y-1/2 bg-current"
        initial={false}
        animate={{ width: struck ? '100%' : '0%' }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      />
    </span>
  )
}

// Custom cursor shown while hovering an UNCHECKED checkbox. Native cursor is
// hidden (cursor-none on the node) and this follows the pointer instead — a
// bare checkmark that draws left→right on a loop, making the click feel
// deliberate. Not shown when un-checking (the box is already ticked). GIF
// cursors don't animate across browsers, so we portal a pointer-tracking
// element and animate the SVG path with Framer.
function CheckCursor({ x, y }: { x: number; y: number }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <motion.div
      aria-hidden
      className="pointer-events-none fixed z-50 text-foreground"
      style={{ left: x, top: y }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ type: 'spring', stiffness: 700, damping: 30 }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="-translate-x-1/2 -translate-y-1/2 drop-shadow-sm"
      >
        {/* Path starts bottom-left → draws to top-right (left→right). */}
        <motion.path
          d="M4 12 9 17 20 6"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: [0, 1] }}
          transition={{
            duration: 0.6,
            ease: 'easeInOut',
            repeat: Infinity,
            repeatDelay: 0.5,
          }}
        />
      </svg>
    </motion.div>,
    document.body
  )
}

function Row({
  app,
  onSetStatus,
  onDelete,
}: {
  app: Application
  onSetStatus: (id: string, status: ApplicationStatus) => void
  onDelete: (id: string) => void
}) {
  const isToApply = app.status === 'to_apply'
  // Applied rows recede — dim the whole row so open (to-apply) ones stand out.
  const restOpacity = isToApply ? 1 : 0.45

  // Pointer-tracked custom cursor over the checkbox (see CheckCursor).
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)

  // Whole row opens the posting (if any). The checkbox stops propagation so
  // toggling status never triggers the navigation.
  function openPosting() {
    if (app.url) window.open(app.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: restOpacity, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
      data-status={app.status}
    >
      <div className="group relative flex items-center gap-3 rounded-lg py-2 pr-2">
        {/* Rail node = the checkbox. Sits above the continuous rail line (drawn
            on the <ul>). No backing ring — the line runs unbroken behind every
            node; on hover the transparent backing reveals the full line.
            Toggling re-stamps the date. */}
        <span
          className={
            'relative z-10 flex w-5 shrink-0 items-center justify-center' +
            (cursor ? ' [&_*]:cursor-none' : ' [&_*]:cursor-pointer')
          }
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onMouseEnter={(e) =>
            isToApply && setCursor({ x: e.clientX, y: e.clientY })
          }
          onMouseMove={(e) =>
            isToApply && setCursor({ x: e.clientX, y: e.clientY })
          }
          onMouseLeave={() => setCursor(null)}
        >
          <AnimatePresence>
            {cursor && <CheckCursor x={cursor.x} y={cursor.y} />}
          </AnimatePresence>
          <span className="flex size-4.5 items-center justify-center rounded-[.25rem] bg-background">
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
          {/* Only the text is the link target — not the whole row. */}
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
              'group/link flex w-fit max-w-full min-w-0 items-baseline gap-2 rounded' +
              (app.url ? ' cursor-pointer' : '')
            }
          >
            <StrikeText
              struck={!isToApply}
              className={
                'shrink-0 text-sm font-bold decoration-1 underline-offset-2' +
                (app.url ? ' group-hover/link:underline' : '')
              }
            >
              {app.company}
            </StrikeText>
            {app.role && (
              <StrikeText
                struck={!isToApply}
                className={
                  'min-w-0 truncate text-sm text-muted-foreground decoration-1 underline-offset-2' +
                  (app.url ? ' group-hover/link:underline' : '')
                }
              >
                {app.role}
              </StrikeText>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
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

          {/* Delete — reveals on row hover, sits right of the time/link icon. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(app.id)
            }}
            aria-label="Delete application"
            title="Delete"
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 transition-[opacity,color] hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </motion.li>
  )
}

// Date grouping: Today, Yesterday, then one group per calendar day (no "This
// week"/"Earlier" coalescing — older entries keep their own dated group). The
// key is a stable per-day string; the label is what shows in the gutter.
function groupMeta(iso: string): { key: string; label: string } {
  const d = startOfDay(new Date(iso)).getTime()
  const today = startOfDay(new Date()).getTime()
  const yesterday = startOfDay(addDays(new Date(), -1)).getTime()
  if (d >= today) return { key: 'today', label: 'Today' }
  if (d >= yesterday) return { key: 'yesterday', label: 'Yesterday' }
  const date = new Date(iso)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  const label = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
  return { key: toDayKey(iso), label }
}

export function Timeline({
  applications,
  onSetStatus,
  onDelete,
}: {
  applications: Application[]
  onSetStatus: (id: string, status: ApplicationStatus) => void
  onDelete: (id: string) => void
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

  // Walk the (already newest-first) list once, appending to a group the first
  // time its key appears. Insertion order = display order, so groups and the
  // rows inside them stay newest-first without any re-sort.
  const groups: { key: string; label: string; items: Application[] }[] = []
  const indexByKey = new Map<string, number>()
  for (const app of applications) {
    const { key, label } = groupMeta(app.appliedAt)
    let i = indexByKey.get(key)
    if (i === undefined) {
      i = groups.length
      indexByKey.set(key, i)
      groups.push({ key, label, items: [] })
    }
    groups[i].items.push(app)
  }

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
                <Row
                  key={app.id}
                  app={app}
                  onSetStatus={onSetStatus}
                  onDelete={onDelete}
                />
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}
    </div>
  )
}
