'use client'

// Reverse-chronological timeline of logged applications, bucketed into date
// groups (Today / Yesterday / then one group per calendar day). A vertical rail
// with a node per entry runs down the left of each group. Each row is two
// lines: company + status pill on top, role + tags below, with the date and
// delete control on the right. Groups key off `createdAt` (the log date), so a
// row never moves once written. Leaving the backlog stamps `appliedAt`
// (handled in the hook) so the heatmap credits the day you applied — the row
// stays put and shows that submission date instead of a relative time.
// Framer `layout` + fade/slide so new and re-ordered rows animate.

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink, Trash2, X } from 'lucide-react'
import { relativeTime, shortDate, startOfDay, addDays, toDayKey } from '@/lib/date'
import { STATUS_META, usesCheckbox } from '@/lib/status'
import type { Application, ApplicationStatus } from '@/lib/types'
import { Checkbox } from '@/components/ui/checkbox'
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/timeline/status-pill'
import { TagEditor } from '@/components/timeline/tag-editor'

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

// One tag on a row. The × only exists on hover/focus so a resting row reads as
// plain labels rather than a cluster of controls.
function TagChip({ tag, onRemove }: { tag: string; onRemove: () => void }) {
  return (
    <span className="group/tag inline-flex h-4 shrink-0 items-center gap-0.5 rounded-[.25rem] border border-border bg-muted/60 pl-1 pr-1 text-[.625rem] font-medium text-muted-foreground transition-colors hover:text-foreground">
      {tag}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        aria-label={`Remove tag ${tag}`}
        className="-mr-0.5 hidden size-3 cursor-pointer items-center justify-center rounded-[.125rem] hover:bg-foreground/10 focus-visible:flex group-hover/tag:flex"
      >
        <X aria-hidden className="size-2.5" />
      </button>
    </span>
  )
}

function Row({
  app,
  tagSuggestions,
  onSetStatus,
  onSetTags,
  onDelete,
}: {
  app: Application
  tagSuggestions: string[]
  onSetStatus: (id: string, status: ApplicationStatus) => void
  onSetTags: (id: string, tags: string[]) => void
  onDelete: (id: string) => void
}) {
  const meta = STATUS_META[app.status]
  const isBacklog = app.status === 'to_apply'
  // Backlogged → time since logging; submitted → the submission date (absolute).
  const timeStamp = isBacklog ? app.createdAt : app.appliedAt
  const timeLabel = isBacklog ? relativeTime(app.createdAt) : shortDate(app.appliedAt)
  const timeTitle = isBacklog
    ? `Saved ${new Date(app.createdAt).toLocaleString()}`
    : `Applied ${new Date(app.appliedAt).toLocaleString()}`

  // Pointer-tracked custom cursor over the checkbox (see CheckCursor).
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  // Stable anchor for the tag popup — see TagEditor.
  const tagLineRef = useRef<HTMLDivElement>(null)

  // The company is a real <a>: it gets a proper accessible name from its own
  // text, middle-click and open-in-new-tab for free, and target=_blank +
  // rel=noopener does natively what a window.open handler used to. The role
  // below is plain text — a second link would double the tab stops on every
  // row for a destination the company already covers — but it still underlines
  // with the company on hover, so the whole block reads as one link target.
  const linkClass = app.url ? ' group-hover/link:underline' : ''

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -8 }}
      // Finished rows (applied, rejected) recede so the list foregrounds what
      // still needs action — see STATUS_META.
      animate={{ opacity: meta.opacity, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
      data-status={app.status}
    >
      {/* items-start, not items-center: the row is two lines and the rail node
          must stay locked to the FIRST line, otherwise the continuous rail
          drifts as rows grow or shrink. */}
      <div className="group relative flex items-start gap-3 rounded-lg py-2 pr-2">
        {/* Rail node. h-5 matches the first line's line-height, so with
            items-center inside, the node's centre lands exactly on that line's
            centre no matter what the rest of the row does. Sits above the
            continuous rail drawn on the container; the small opaque backing
            keeps the line from showing through the glyph. */}
        <span
          className={
            'relative z-10 flex h-5 w-5 shrink-0 items-center justify-center' +
            (cursor ? ' [&_*]:cursor-none' : ' [&_*]:cursor-pointer')
          }
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onMouseEnter={(e) =>
            isBacklog && setCursor({ x: e.clientX, y: e.clientY })
          }
          onMouseMove={(e) =>
            isBacklog && setCursor({ x: e.clientX, y: e.clientY })
          }
          onMouseLeave={() => setCursor(null)}
        >
          <AnimatePresence>
            {cursor && <CheckCursor x={cursor.x} y={cursor.y} />}
          </AnimatePresence>
          <span className="flex size-4.5 items-center justify-center rounded-[.25rem] bg-background">
            {usesCheckbox(app.status) ? (
              <Checkbox
                checked={!isBacklog}
                onCheckedChange={(checked) =>
                  onSetStatus(app.id, checked ? 'applied' : 'to_apply')
                }
                aria-label={isBacklog ? 'Mark applied' : 'Move back to To apply'}
              />
            ) : (
              // Past 'applied' the node stops being a checkbox: unticking it
              // would collapse 'interview' straight back to 'to_apply' and lose
              // the stage. It becomes a colour-coded read-only marker instead,
              // and the pill owns the transition.
              <span
                aria-hidden
                title={meta.label}
                className={`size-2.5 rounded-full ${meta.dot}`}
              />
            )}
          </span>
        </span>

        {/* group/link spans both lines so hovering either one underlines both —
            the company and its role read as a single link target even though
            only the company is focusable. */}
        <div className="group/link flex min-w-0 flex-1 flex-col gap-0.5">
          {/* LINE 1 — company + status. */}
          <div className="flex h-5 min-w-0 items-center gap-2">
            {app.url ? (
              <a
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <StrikeText
                  struck={meta.struck}
                  className={
                    'block truncate text-sm font-bold decoration-1 underline-offset-2' +
                    linkClass
                  }
                >
                  {app.company}
                </StrikeText>
              </a>
            ) : (
              <StrikeText
                struck={meta.struck}
                className="block min-w-0 truncate text-sm font-bold"
              >
                {app.company}
              </StrikeText>
            )}
            <StatusPill
              status={app.status}
              company={app.company}
              onChange={(status) => onSetStatus(app.id, status)}
            />
          </div>

          {/* LINE 2 — role + tags. Always rendered (min-h-4) even when both are
              empty: the tag '+' lives here and appears on hover, and reserving
              the space keeps rows from jumping as the pointer crosses them.

              flex-wrap is what makes this survive a narrow viewport. The chips
              are shrink-0, so without it they'd win the space fight and squeeze
              the role down to an ellipsis. Wrapping instead puts a long role on
              a line of its own (where it truncates against the full width) and
              drops the tags underneath — while on a wide screen everything
              still fits on one line and nothing moves. */}
          <div
            ref={tagLineRef}
            className="flex min-h-4 min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1"
          >
            {app.role && (
              <StrikeText
                struck={meta.struck}
                className={
                  'min-w-0 truncate text-xs text-muted-foreground decoration-1 underline-offset-2' +
                  linkClass
                }
              >
                {app.role}
              </StrikeText>
            )}
            {app.tags.map((tag) => (
              <TagChip
                key={tag}
                tag={tag}
                onRemove={() =>
                  onSetTags(
                    app.id,
                    app.tags.filter((t) => t !== tag)
                  )
                }
              />
            ))}
            <TagEditor
              tags={app.tags}
              suggestions={tagSuggestions}
              company={app.company}
              anchor={tagLineRef}
              onChange={(tags) => onSetTags(app.id, tags)}
            />
          </div>
        </div>

        {/* Right rail: date + delete, aligned to line 1. */}
        <div className="flex h-5 shrink-0 items-center gap-1">
          {/* Submitted rows show WHEN they went out, as an absolute date: the
              row sits in its log-date group, so "1mo ago" there would read as
              the group's date. Backlogged rows have no submission yet, so they
              keep relative time off the log date. Swapped for an open-link
              affordance on hover. */}
          {app.url ? (
            <span className="relative shrink-0">
              <time
                className="text-xs tabular-nums text-muted-foreground group-hover:opacity-0"
                dateTime={timeStamp}
                title={timeTitle}
              >
                {timeLabel}
              </time>
              <ExternalLink
                aria-hidden
                className="absolute right-0 top-1/2 size-4 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              />
            </span>
          ) : (
            <time
              className="shrink-0 text-xs tabular-nums text-muted-foreground"
              dateTime={timeStamp}
              title={timeTitle}
            >
              {timeLabel}
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
  tagSuggestions,
  filtered,
  onClearFilters,
  onSetStatus,
  onSetTags,
  onDelete,
}: {
  applications: Application[]
  tagSuggestions: string[]
  // True when the list has been narrowed by search/filters — changes what an
  // empty result means, and therefore what the empty state should offer.
  filtered: boolean
  onClearFilters: () => void
  onSetStatus: (id: string, status: ApplicationStatus) => void
  onSetTags: (id: string, tags: string[]) => void
  onDelete: (id: string) => void
}) {
  if (applications.length === 0) {
    return filtered ? (
      <Empty className="rounded-2xl border border-dashed">
        <EmptyTitle>No matches</EmptyTitle>
        <EmptyDescription>
          Nothing here fits the current search and filters.
        </EmptyDescription>
        <Button variant="outline" size="sm" onClick={onClearFilters}>
          Clear filters
        </Button>
      </Empty>
    ) : (
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
    const { key, label } = groupMeta(app.createdAt)
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
          node centre (10px) = 78px.

          It runs the full height and is masked to fade out at the first and
          last node centres. The two ends differ because the node is pinned to
          the row's FIRST line, so there is more row below it than above:
            top    = py-2 (8) + half the 20px first line  = 18px
            bottom = row height - 18
          The top is a hard edge because the first row's geometry is fixed. The
          bottom is a long fade because the LAST row's height isn't: its tags
          may have wrapped to a second line on a narrow screen. Fading across
          that uncertainty reads as the rail trailing off; a hard edge would
          read as it overshooting or stopping short. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-[78px] inset-y-0 w-0.5 -translate-x-1/2 bg-muted-foreground/30 [mask-image:linear-gradient(to_bottom,transparent_0,#000_18px,#000_calc(100%-52px),transparent_calc(100%-14px))]"
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
                  tagSuggestions={tagSuggestions}
                  onSetStatus={onSetStatus}
                  onSetTags={onSetTags}
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
