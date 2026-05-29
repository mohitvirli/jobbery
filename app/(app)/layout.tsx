// Authenticated app shell. v0 renders directly with no auth gate — this route
// group exists so that when auth lands, the gate/redirect and nav live here
// without restructuring routes or moving pages.
//
// (Placeholder for post-auth nav, user menu, etc.)

import { ThemeToggle } from '@/components/theme-toggle'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-5 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-semibold tracking-tight">Applywall</h1>
          <span className="text-xs text-muted-foreground">keep the streak</span>
        </div>
        <ThemeToggle />
      </header>
      {children}
    </div>
  )
}
