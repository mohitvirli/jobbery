'use client'

// Search + filter controls, split into two pieces that live in different places:
//
//   TimelineToolbar — search and the status/tag filter menu, in that order.
//     Sits at the right edge of the timeline column: in the header on desktop,
//     above the list on mobile. The search starts collapsed to a single icon
//     and expands leftward on click, so it grows into empty space instead of
//     pushing the filter button around.
//   ActiveFilters  — the chip line. Sits directly above the timeline, because
//     it explains why the list below it is short. Renders nothing when no
//     filter is applied.
//
// Both narrow the TIMELINE only. The heatmap and stats keep reading the full
// list: they describe overall momentum, not whatever you happen to be looking
// at right now.

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ListFilter, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/ui/popover'
import { Kbd } from '@/components/ui/kbd'
import { Badge } from '@/components/ui/badge'
import { STATUS_META, STATUS_ORDER } from '@/lib/status'
import { isFilterActive, type TimelineFilter } from '@/lib/filter'
import type { ApplicationStatus } from '@/lib/types'

// Toggle a value in/out of an array without caring about order.
function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function CheckRow({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground"
    >
      <span
        aria-hidden
        className={
          'flex size-3.5 shrink-0 items-center justify-center rounded-[.25rem] border transition-colors ' +
          (active ? 'border-primary bg-primary text-primary-foreground' : 'border-input')
        }
      >
        {active && (
          <svg viewBox="0 0 24 24" className="size-2.5" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.7 10 18.6 18.7 5.4" />
          </svg>
        )}
      </span>
      {children}
    </button>
  )
}

// Collapsed width is the icon button; expanded is enough room for a company and
// a role. Animating between the two on one element (rather than swapping a
// button for an input) keeps the control anchored in the header instead of
// making the brand jump sideways.
const COLLAPSED = 32
const EXPANDED = 224

function CollapsingSearch({
  filter,
  onChange,
  enableShortcut,
}: {
  filter: TimelineFilter
  onChange: (next: TimelineFilter) => void
  // Only one instance may claim the global '/' — the toolbar renders twice
  // (header on desktop, above the timeline on mobile) and both are mounted.
  enableShortcut: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  // A query with nowhere visible to show it is a filter the user can't find, so
  // the field stays open as long as one is set and only collapses once empty.
  const [open, setOpen] = useState(false)
  const expanded = open || filter.query !== ''

  function expand() {
    setOpen(true)
    // Focus after the state lands, or the element is still width-0 and Safari
    // refuses to focus it.
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  useEffect(() => {
    if (!enableShortcut) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      if (typing) return
      e.preventDefault()
      expand()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enableShortcut])

  return (
    <motion.div
      animate={{ width: expanded ? EXPANDED : COLLAPSED }}
      initial={false}
      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
      className={
        'relative flex h-8 shrink-0 items-center overflow-hidden rounded-lg border transition-colors sm:h-7 ' +
        (expanded
          ? 'border-input bg-background dark:bg-input/32'
          : 'border-transparent')
      }
    >
      {/* The icon is the trigger while collapsed and a plain adornment once
          open, where the input behind it owns the clicks. */}
      <button
        type="button"
        onClick={expand}
        tabIndex={expanded ? -1 : 0}
        aria-label="Search applications"
        aria-expanded={expanded}
        className={
          'absolute left-0 flex size-8 items-center justify-center rounded-lg text-muted-foreground sm:size-7 ' +
          (expanded
            ? 'pointer-events-none'
            : 'cursor-pointer hover:bg-accent hover:text-foreground')
        }
      >
        <Search aria-hidden className="size-4" />
      </button>

      <input
        ref={inputRef}
        type="search"
        value={filter.query}
        onChange={(e) => onChange({ ...filter, query: e.target.value })}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          // Escape clears first and collapses second, so a stray press never
          // discards a search you're mid-way through refining.
          if (filter.query) onChange({ ...filter, query: '' })
          else {
            setOpen(false)
            inputRef.current?.blur()
          }
        }}
        placeholder="Search company, role, tag…"
        aria-label="Search applications"
        // aria-hidden while collapsed: the button beside it already carries the
        // accessible name, and a zero-width field would just be a second one.
        aria-hidden={!expanded}
        tabIndex={expanded ? 0 : -1}
        className={
          'h-full w-full bg-transparent pl-8 pr-8 text-sm outline-none placeholder:text-muted-foreground/72 [&::-webkit-search-cancel-button]:appearance-none ' +
          (expanded ? '' : 'pointer-events-none')
        }
      />

      {expanded &&
        (filter.query ? (
          <button
            type="button"
            // onMouseDown, not onClick: the input's blur would collapse the
            // field and unmount this button before a click could land.
            onMouseDown={(e) => {
              e.preventDefault()
              onChange({ ...filter, query: '' })
              inputRef.current?.focus()
            }}
            aria-label="Clear search"
            className="absolute right-1.5 flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        ) : (
          <Kbd className="pointer-events-none absolute right-2">/</Kbd>
        ))}
    </motion.div>
  )
}

export function TimelineToolbar({
  filter,
  onChange,
  tagOptions,
  enableShortcut = false,
  className,
}: {
  filter: TimelineFilter
  onChange: (next: TimelineFilter) => void
  tagOptions: string[]
  enableShortcut?: boolean
  className?: string
}) {
  const chipCount = filter.statuses.length + filter.tags.length

  // Suggestion order first, so ticking a box never re-sorts the list under the
  // cursor. Selected tags that no longer exist on any row (the last row using
  // one just dropped it) are appended, otherwise they'd be stuck on with no
  // checkbox left to untick.
  const tagList = useMemo(
    () => [...tagOptions, ...filter.tags.filter((t) => !tagOptions.includes(t))],
    [filter.tags, tagOptions]
  )

  return (
    <div className={'flex items-center gap-1' + (className ? ' ' + className : '')}>
      <CollapsingSearch
        filter={filter}
        onChange={onChange}
        enableShortcut={enableShortcut}
      />

      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant={chipCount > 0 ? 'secondary' : 'ghost'}
              size="sm"
              aria-label="Filter by status and tags"
            />
          }
        >
          <ListFilter aria-hidden />
          Filters
          {chipCount > 0 && (
            <Badge size="sm" variant="default">
              {chipCount}
            </Badge>
          )}
        </PopoverTrigger>
        <PopoverPopup align="start" className="w-56 p-1">
          <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">
            Status
          </p>
          {STATUS_ORDER.map((s: ApplicationStatus) => (
            <CheckRow
              key={s}
              active={filter.statuses.includes(s)}
              onClick={() =>
                onChange({ ...filter, statuses: toggle(filter.statuses, s) })
              }
            >
              <span
                aria-hidden
                className={`size-1.5 shrink-0 rounded-full ${STATUS_META[s].dot}`}
              />
              {STATUS_META[s].label}
            </CheckRow>
          ))}

          {tagList.length > 0 && (
            <>
              <p className="mt-1 border-t px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                Tags
              </p>
              <div className="flex max-h-48 flex-col overflow-y-auto">
                {tagList.map((tag) => (
                  <CheckRow
                    key={tag}
                    active={filter.tags.includes(tag)}
                    onClick={() =>
                      onChange({ ...filter, tags: toggle(filter.tags, tag) })
                    }
                  >
                    <span className="truncate">{tag}</span>
                  </CheckRow>
                ))}
              </div>
            </>
          )}
        </PopoverPopup>
      </Popover>
    </div>
  )
}

// The chip line above the timeline: what's filtering, how much it cut, and the
// way out. Collapses to nothing when no filter is applied.
export function ActiveFilters({
  filter,
  onChange,
  matchCount,
  totalCount,
}: {
  filter: TimelineFilter
  onChange: (next: TimelineFilter) => void
  matchCount: number
  totalCount: number
}) {
  const active = isFilterActive(filter)

  return (
    <AnimatePresence initial={false}>
      {active && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.15 }}
          className="overflow-hidden"
        >
          <div className="flex flex-wrap items-center gap-1.5 pb-3 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {matchCount} of {totalCount}
            </span>
            {filter.query && (
              <button
                type="button"
                onClick={() => onChange({ ...filter, query: '' })}
                aria-label={`Clear search for ${filter.query}`}
                className="inline-flex h-5 max-w-48 cursor-pointer items-center gap-1 rounded-[.25rem] border bg-muted/60 px-1.5 font-medium hover:text-foreground"
              >
                <span className="truncate">“{filter.query}”</span>
                <X aria-hidden className="size-2.5 shrink-0" />
              </button>
            )}
            {filter.statuses.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() =>
                  onChange({ ...filter, statuses: toggle(filter.statuses, s) })
                }
                aria-label={`Remove status filter ${STATUS_META[s].label}`}
                className="inline-flex h-5 cursor-pointer items-center gap-1 rounded-[.25rem] border bg-muted/60 px-1.5 font-medium hover:text-foreground"
              >
                <span aria-hidden className={`size-1.5 rounded-full ${STATUS_META[s].dot}`} />
                {STATUS_META[s].label}
                <X aria-hidden className="size-2.5" />
              </button>
            ))}
            {filter.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onChange({ ...filter, tags: toggle(filter.tags, tag) })}
                aria-label={`Remove tag filter ${tag}`}
                className="inline-flex h-5 cursor-pointer items-center gap-1 rounded-[.25rem] border bg-muted/60 px-1.5 font-medium hover:text-foreground"
              >
                {tag}
                <X aria-hidden className="size-2.5" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => onChange({ query: '', statuses: [], tags: [] })}
              className="cursor-pointer underline underline-offset-2 hover:text-foreground"
            >
              Clear
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
