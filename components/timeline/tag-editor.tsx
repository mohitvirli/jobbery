'use client'

// Label-picker popover for a row's tags. Trigger is a small '+' that only
// materializes on row hover (or focus) so the timeline stays quiet; the popup
// is an input over a filtered list of tags already in use, plus a "create"
// affordance when what you typed is new.
//
// Suggestions come from the loaded rows (see allTags), not a stored vocabulary,
// so there is nothing to keep in sync — a tag stops being suggested once the
// last row using it lets it go.

import { useMemo, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/ui/popover'
import { normalizeTag } from '@/lib/tags'

export function TagEditor({
  tags,
  suggestions,
  onChange,
  company,
  anchor,
}: {
  tags: string[]
  suggestions: string[]
  onChange: (tags: string[]) => void
  company: string
  // The popup is positioned against this instead of the '+' itself. The '+'
  // sits AFTER the chips, so adding a tag pushes it sideways — anchoring to it
  // would make the popup hop mid-edit. The row's tag line has a fixed left
  // edge, so anchoring there keeps the popup still while you work.
  anchor: React.RefObject<HTMLElement | null>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const typed = normalizeTag(query)

  // Order is suggestion order (most-used first) and never re-sorts on select:
  // hoisting the ticked ones to the top would move the next row out from under
  // the cursor mid-click. Which tags are on the row is already answered twice
  // over — by the chips in the row itself and by the tick in this list.
  const matches = useMemo(() => {
    const pool = [...new Set([...suggestions, ...tags])]
    const filtered = typed ? pool.filter((t) => t.includes(typed)) : pool
    return filtered.slice(0, 8)
  }, [tags, suggestions, typed])

  // Offer creation only for something genuinely new — an exact hit is already
  // in the list above and toggling it is the same keystroke.
  const canCreate = typed.length > 0 && !matches.includes(typed)

  function toggle(tag: string) {
    onChange(
      tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]
    )
    setQuery('')
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger
        // The row is a link target and has its own key handler; neither should
        // fire while you're managing tags.
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        render={
          <button
            type="button"
            aria-label={`Add tag to ${company}`}
            title="Add tag"
            // pointer-coarse: touch has no hover to reveal this with.
            className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[.25rem] border border-dashed border-muted-foreground/40 text-muted-foreground opacity-0 transition-opacity hover:border-muted-foreground hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100 data-popup-open:opacity-100"
          />
        }
      >
        <Plus aria-hidden className="size-2.5" />
      </PopoverTrigger>

      <PopoverPopup
        anchor={anchor}
        align="start"
        className="w-56 p-1"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Input
          autoFocus
          size="sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find or create a tag"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            // Enter commits the obvious thing: the top match if there is one,
            // otherwise the new tag you just typed.
            const target = matches[0] ?? (canCreate ? typed : null)
            if (target) toggle(target)
          }}
        />

        <div className="mt-1 flex max-h-56 flex-col overflow-y-auto">
          {matches.map((tag) => {
            const active = tags.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggle(tag)}
                className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span className="truncate">{tag}</span>
                {active && <Check aria-hidden className="size-3.5 shrink-0" />}
              </button>
            )
          })}

          {canCreate && (
            <button
              type="button"
              onClick={() => toggle(typed)}
              className="flex cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <Plus aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">
                Create <span className="font-medium text-foreground">{typed}</span>
              </span>
            </button>
          )}

          {matches.length === 0 && !canCreate && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              No tags yet — type to create one.
            </p>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  )
}
