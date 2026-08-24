'use client'

// The pipeline control on a timeline row: a badge showing the current stage
// that opens a radio menu to change it.
//
// Visibility is deliberately asymmetric. A 'to_apply' row already says "not
// submitted" via its unchecked box, so a "To apply" pill next to it is pure
// noise — it stays hidden until the row is hovered or the pill is focused,
// keeping the backlog visually quiet while still being reachable by mouse and
// keyboard. Submitted rows always show their pill, because 'applied' vs
// 'interview' vs 'offer' is information nothing else on the row carries.
//
// pointer-coarse pins it visible on touch, where there is no hover to reveal it
// with and the control would otherwise be unreachable.

import { ChevronDown } from 'lucide-react'
import { badgeVariants } from '@/components/ui/badge'
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '@/components/ui/menu'
import { STATUS_META, STATUS_ORDER } from '@/lib/status'
import type { ApplicationStatus } from '@/lib/types'

export function StatusPill({
  status,
  onChange,
  company,
}: {
  status: ApplicationStatus
  onChange: (status: ApplicationStatus) => void
  // Used only for the accessible name, so screen-reader users hear which row
  // the menu belongs to instead of five identical "Change status" buttons.
  company: string
}) {
  const meta = STATUS_META[status]
  const isBacklog = status === 'to_apply'

  return (
    <Menu>
      <MenuTrigger
        // stopPropagation: the company/role block above is a link target, and
        // the row's keyboard handler opens the posting on Enter/Space.
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        // A real <button>, styled with the badge recipe rather than rendering
        // <Badge> (a <span>): base-ui's trigger declares native button
        // semantics, and swapping in a span silently drops them.
        render={
          <button
            type="button"
            aria-label={`Status: ${meta.label}. Change status for ${company}`}
            className={
              badgeVariants({ size: 'sm', variant: meta.variant }) +
              ' cursor-pointer gap-0.5 pr-0.5 transition-opacity focus-visible:opacity-100 data-popup-open:opacity-100' +
              (isBacklog
                ? ' opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100'
                : '')
            }
          />
        }
      >
        {meta.label}
        <ChevronDown aria-hidden className="size-3 opacity-60" />
      </MenuTrigger>
      <MenuPopup align="start" className="min-w-36">
        <MenuRadioGroup
          value={status}
          onValueChange={(value) => onChange(value as ApplicationStatus)}
        >
          {STATUS_ORDER.map((s) => (
            // Radio items keep the menu open by default (native radio-group
            // behaviour). Here a pick is a decision, not an exploration, so it
            // dismisses — same as picking from any other one-shot menu.
            <MenuRadioItem key={s} value={s} closeOnClick>
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`size-1.5 shrink-0 rounded-full ${STATUS_META[s].dot}`}
                />
                {STATUS_META[s].label}
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  )
}
