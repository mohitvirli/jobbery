// Authenticated app shell. v0 renders directly with no auth gate — this route
// group exists so that when auth lands, the gate/redirect and nav live here
// without restructuring routes or moving pages.
//
// (Placeholder for post-auth nav, user menu, etc.)

import { SettingsDialog } from '@/components/settings-dialog'
import { AuthProvider } from '@/components/auth-provider'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-5 py-10 lg:h-dvh lg:max-w-none lg:overflow-hidden lg:p-0">
        {/* Mobile-only header. On desktop the header lives inside the left column
            so the right panel can bleed to the very top of the viewport. */}
        <header className="mb-8 flex items-center justify-between lg:hidden">
          <div className="flex flex-col gap-0.5">
            <h1 className="font-mono text-lg font-semibold tracking-tight">
              <span className="text-muted-foreground">[</span>
              jobbery
              <span className="text-muted-foreground">]</span>
            </h1>
            <span className="text-[10px] text-muted-foreground">keep the streak</span>
          </div>
          <SettingsDialog />
        </header>
        {children}
      </div>
    </AuthProvider>
  )
}
