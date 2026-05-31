'use client'

// Settings entry point: a gear button that opens a dialog. Exposes theme
// selection (a grid of preview cards) and the weekly application target.
// Everything AUTO-SAVES on change — picking a theme applies it live
// (next-themes persists), and the weekly target writes through on each step.
// There's no Save button; the footer just dismisses.

import { useTheme } from 'next-themes'
import { Settings, Check, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldDecrement,
  NumberFieldInput,
  NumberFieldIncrement,
} from '@/components/ui/number-field'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { THEMES, DEFAULT_THEME } from '@/lib/themes'
import type { ThemeMeta } from '@/lib/themes'
import { useSettings } from '@/hooks/use-settings'

function ThemeCard({
  theme,
  active,
  onSelect,
}: {
  theme: ThemeMeta
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      aria-label={theme.label}
      className={cn(
        'group relative flex flex-col gap-1.5 rounded-md border p-1.5 text-left transition-colors',
        'hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-foreground/60 ring-1 ring-foreground/30' : 'border-border'
      )}
    >
      {/* Swatch strip — the theme's background + 4 heatmap cell tints. */}
      <div
        className="flex h-7 overflow-hidden rounded-sm border"
        style={{ backgroundColor: theme.swatches[0] }}
      >
        <div className="flex flex-1 items-center justify-center gap-0.5">
          {theme.swatches.slice(1).map((c, i) => (
            <span
              key={i}
              className="h-2.5 w-2.5 rounded-[2px]"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <span className="truncate text-[11px] font-medium leading-none">{theme.label}</span>
      {active && (
        <span className="absolute right-2 top-2 flex size-3.5 items-center justify-center rounded-full bg-foreground text-background">
          <Check className="size-2.5" strokeWidth={3} />
        </span>
      )}
    </button>
  )
}

export function SettingsDialog() {
  const { theme, setTheme } = useTheme()
  const { settings, update } = useSettings()
  const { user } = useAuth()
  const active = theme ?? DEFAULT_THEME

  // Sign out only makes sense for an authed user — the auth listener in
  // AuthProvider flips `user` to null reactively, so no manual redirect needed.
  const handleSignOut = () => {
    void createClient().auth.signOut()
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Settings" title="Settings" />
        }
      >
        <Settings />
      </DialogTrigger>
      <DialogPopup className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Tune the look and your weekly goal.</DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-6">
          {/* Weekly target — auto-saved on each step. */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="weekly-target">Weekly target</Label>
              <NumberField
                id="weekly-target"
                value={settings.weeklyTarget}
                onValueChange={(v) => update({ weeklyTarget: v ?? 1 })}
                min={1}
                max={99}
                size="sm"
                className="w-32"
              >
                <NumberFieldGroup>
                  <NumberFieldDecrement />
                  <NumberFieldInput />
                  <NumberFieldIncrement />
                </NumberFieldGroup>
              </NumberField>
            </div>
            <p className="text-xs text-muted-foreground">
              Applications you aim to send each week.
            </p>
          </div>

          {/* Theme — live-applied card grid, auto-saved. */}
          <div className="flex flex-col gap-2">
            <Label>Theme</Label>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {THEMES.map((t) => (
                <ThemeCard
                  key={t.id}
                  theme={t}
                  active={t.id === active}
                  onSelect={() => setTheme(t.id)}
                />
              ))}
            </div>
          </div>
        </DialogPanel>
        <DialogFooter>
          {/* Sign out — authed only. Hidden in guest mode (nothing to sign out
              of). Placed left of Done so the dismiss action stays rightmost. */}
          {user && (
            <Button variant="outline" onClick={handleSignOut} className="mr-auto">
              <LogOut />
              Sign out
            </Button>
          )}
          <DialogClose render={<Button variant="outline" />}>Done</DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  )
}
