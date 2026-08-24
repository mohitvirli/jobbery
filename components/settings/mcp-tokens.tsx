'use client'

// The "Connect to Claude" block inside the settings dialog.
//
// Mints and revokes the personal access tokens that authenticate the MCP server
// at /api/mcp. The plaintext token is returned by POST /api/tokens exactly once
// — it lives in component state until the dialog closes and is never fetched
// again, so the UI has to make copying it feel mandatory.
//
// Authed-only: the parent hides this in guest mode, where there's no server-side
// data for an MCP client to reach.

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ApiTokenSummary } from '@/lib/api-tokens'
import { relativeTime } from '@/lib/date'

// Small copy-to-clipboard button. Confirms with a check for ~1.5s so the user
// knows the click registered — the clipboard gives no other feedback.
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  )
}

export function McpTokens() {
  const [tokens, setTokens] = useState<ApiTokenSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The one-time plaintext. Cleared as soon as another token is minted.
  const [fresh, setFresh] = useState<string | null>(null)
  // Two-step revoke: first click arms the row, second click deletes. Avoids
  // nesting an AlertDialog inside the settings Dialog.
  const [armed, setArmed] = useState<string | null>(null)

  // Bumping this re-runs the fetch effect. Mutations bump it instead of calling
  // a shared loader, which keeps every setState inside a promise callback rather
  // than the effect body.
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let active = true
    fetch('/api/tokens')
      .then((res) => {
        if (!res.ok) throw new Error('load failed')
        return res.json() as Promise<ApiTokenSummary[]>
      })
      .then((rows) => {
        if (!active) return
        setTokens(rows)
        setError(null)
      })
      .catch(() => {
        if (active) setError('Could not load tokens.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  const create = async () => {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || 'Claude' }),
      })
      if (!res.ok) throw new Error('create failed')
      const created = (await res.json()) as ApiTokenSummary & { token: string }
      setFresh(created.token)
      setName('')
      reload()
    } catch {
      setError('Could not create the token.')
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (id: string) => {
    setArmed(null)
    try {
      const res = await fetch(`/api/tokens/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('revoke failed')
      reload()
    } catch {
      setError('Could not revoke the token.')
    }
  }

  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const setupCommand =
    `claude mcp add --transport http jobbery ${origin}/api/mcp \\\n` +
    `  --header "Authorization: Bearer ${fresh ?? '<your-token>'}"`

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label>Connect to Claude</Label>
        <p className="text-xs text-muted-foreground">
          Create a token so Claude can log applications and read your streak over MCP.
        </p>
      </div>

      {/* Create */}
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Token name (e.g. Laptop)"
          aria-label="Token name"
          className="flex-1"
        />
        <Button onClick={create} disabled={creating} variant="outline">
          {creating ? <Loader2 className="animate-spin" /> : <Plus />}
          Create
        </Button>
      </div>

      {/* One-time plaintext reveal. */}
      {fresh && (
        <div className="flex flex-col gap-2 rounded-lg border border-success/40 bg-success/10 p-3">
          <p className="text-xs">
            Copy this now — it won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-1">
            <code className="flex-1 overflow-x-auto rounded bg-background px-2 py-1.5 font-mono text-xs">
              {fresh}
            </code>
            <CopyButton value={fresh} label="Copy token" />
          </div>
        </div>
      )}

      {/* Setup command. */}
      <div className="flex items-start gap-1">
        <pre className="flex-1 overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
          {setupCommand}
        </pre>
        <CopyButton value={setupCommand} label="Copy setup command" />
      </div>

      {/* Existing tokens. */}
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading tokens…</p>
      ) : tokens.length === 0 ? (
        <p className="text-xs text-muted-foreground">No tokens yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{t.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {t.prefix}…{' '}
                  {t.lastUsedAt ? `used ${relativeTime(t.lastUsedAt)}` : 'never used'}
                </span>
              </div>
              {armed === t.id ? (
                <Button variant="destructive" size="sm" onClick={() => revoke(t.id)}>
                  Revoke?
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Revoke ${t.name}`}
                  title={`Revoke ${t.name}`}
                  onClick={() => setArmed(t.id)}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
