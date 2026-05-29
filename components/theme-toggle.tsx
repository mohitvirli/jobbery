'use client'

// Theme switcher. Cycles through the THEMES registry, so it keeps working
// unchanged as more themes are added (click advances to the next one). Reads the
// live theme from next-themes. Guards against hydration mismatch by only
// rendering the resolved icon after mount.

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { THEMES } from '@/lib/themes'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  // Hydration guard: theme is unknown on the server, so render a neutral
  // placeholder until mounted. setState-in-effect is the canonical pattern here.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])

  function cycle() {
    const i = THEMES.findIndex((t) => t.id === theme)
    const next = THEMES[(i + 1) % THEMES.length]
    setTheme(next.id)
  }

  // Pre-mount: render a stable placeholder to avoid SSR/client icon mismatch.
  const isDark = mounted ? theme === 'dark' : true
  const label = mounted
    ? `Theme: ${THEMES.find((t) => t.id === theme)?.label ?? theme}`
    : 'Toggle theme'

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycle}
      aria-label={label}
      title={label}
    >
      {isDark ? <Moon /> : <Sun />}
    </Button>
  )
}
