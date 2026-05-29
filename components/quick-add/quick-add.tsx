'use client'

// The friction-killer. One field: paste a job URL or type freely.
//  - Instant: regex extracts the company from known board URLs.
//  - Enriched: a debounced call to /api/parse fetches the page server-side and
//    fills in the real role + company from metadata (CORS blocks doing this in
//    the browser, hence the server route).
// Company + role become editable fields prefilled with the best guess, so one
// glance confirms the log. Status (To apply / Applied) is chosen here.
// Cmd/Ctrl+Enter submits.

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { parseJobUrl, looksLikeUrl, fetchJobMetadata } from '@/lib/url-parser'
import type { ApplicationStatus, JobDetails, NewApplication } from '@/lib/types'

const DEBOUNCE_MS = 400

export function QuickAdd({
  onAdd,
}: {
  onAdd: (input: NewApplication) => Promise<unknown>
}) {
  const [raw, setRaw] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState<ApplicationStatus>('applied')
  const [fetched, setFetched] = useState<JobDetails | null>(null)
  const [fetching, setFetching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Track manual edits so background metadata never clobbers what the user typed.
  const companyTouched = useRef(false)
  const roleTouched = useRef(false)

  const isUrl = looksLikeUrl(raw)
  const regex = isUrl ? parseJobUrl(raw) : null

  // Instant regex prefill on every keystroke (cheap, sync).
  function onRawChange(value: string) {
    setRaw(value)
    if (looksLikeUrl(value)) {
      const r = parseJobUrl(value)
      if (r.matched && !companyTouched.current) setCompany(r.company ?? '')
    }
  }

  // Debounced server metadata fetch. Aborts the prior request as input changes.
  useEffect(() => {
    if (!isUrl) {
      // Reset fetch state when input stops looking like a URL.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFetched(null)
      setFetching(false)
      return
    }
    const ac = new AbortController()
    setFetching(true)
    const t = setTimeout(async () => {
      const md = await fetchJobMetadata(raw.trim(), ac.signal)
      if (ac.signal.aborted) return
      setFetching(false)
      if (md.source === 'metadata') {
        setFetched(md)
        if (!companyTouched.current && md.company) setCompany(md.company)
        if (!roleTouched.current && md.role) setRole(md.role)
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(t)
      ac.abort()
    }
    // companyTouched/roleTouched are refs (no re-run); raw drives the effect.
  }, [raw, isUrl])

  const resolvedCompany =
    company.trim() || (!isUrl ? raw.trim() : regex?.company ?? '')
  const canSubmit = resolvedCompany.length > 0 && !submitting
  const hasInput = raw.trim().length > 0

  function reset() {
    setRaw('')
    setCompany('')
    setRole('')
    setFetched(null)
    setFetching(false)
    companyTouched.current = false
    roleTouched.current = false
    // status persists — likely logging several of the same kind in a row.
    inputRef.current?.focus()
  }

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const input: NewApplication = {
        company: resolvedCompany,
        role: role.trim() || null,
        url: isUrl ? raw.trim() : null,
        note: null,
        status,
      }
      await onAdd(input)
      reset()
    } finally {
      setSubmitting(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }

  const submitLabel = status === 'applied' ? 'Log Application' : 'Save to apply'

  return (
    <div
      onKeyDown={onKeyDown}
      className="flex flex-col gap-3 rounded-2xl border bg-card p-4"
    >
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={raw}
          onChange={(e) => onRawChange(e.target.value)}
          placeholder="Paste a job URL or type a company…"
          size="lg"
          autoFocus
          aria-label="Job URL or company"
        />
        <Button
          size="icon-lg"
          onClick={() => void submit()}
          loading={submitting}
          disabled={!canSubmit}
          aria-label={submitLabel}
          title={submitLabel}
        >
          <ArrowRight />
        </Button>
      </div>

      {/* Status segmented control */}
      <div className="flex items-center gap-1.5">
        <StatusButton
          active={status === 'applied'}
          onClick={() => setStatus('applied')}
        >
          Applied
        </StatusButton>
        <StatusButton
          active={status === 'to_apply'}
          onClick={() => setStatus('to_apply')}
        >
          To apply
        </StatusButton>

        {/* Fetch state hint */}
        <AnimatePresence initial={false}>
          {isUrl && (regex?.board || fetched?.board) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <Badge variant="secondary" className="capitalize">
                {fetched?.board ?? regex?.board}
              </Badge>
              {fetching ? (
                <span className="flex items-center gap-1">
                  <Spinner className="size-3" /> reading page…
                </span>
              ) : fetched?.source === 'metadata' ? (
                <span>from page</span>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Editable company + role, prefilled by the best available guess */}
      <AnimatePresence initial={false}>
        {hasInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Input
                value={company}
                onChange={(e) => {
                  companyTouched.current = true
                  setCompany(e.target.value)
                }}
                placeholder="Company"
                aria-label="Company"
              />
              <Input
                value={role}
                onChange={(e) => {
                  roleTouched.current = true
                  setRole(e.target.value)
                }}
                placeholder="Role (optional)"
                aria-label="Role"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        <Kbd>⌘</Kbd>
        <Kbd>↵</Kbd>
        <span>to {status === 'applied' ? 'log' : 'save'}</span>
      </div>
    </div>
  )
}

// Small segmented-control button. Inline (not a separate file) — only used here.
function StatusButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'secondary' : 'ghost'}
      onClick={onClick}
      data-active={active || undefined}
    >
      {children}
    </Button>
  )
}
