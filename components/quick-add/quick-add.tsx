'use client'

// The friction-killer. One field: paste a job URL or type freely.
//  - Instant: regex extracts the company from known board URLs.
//  - Enriched: a debounced call to /api/parse fetches the page server-side and
//    fills in the real role + company from metadata (CORS blocks doing this in
//    the browser, hence the server route).
// The submit button shows the fetch spinner and turns green on a clean parse.
// An edit icon (left of the field) reveals company + title inputs, prefilled
// with the best guess. New entries default to "to apply"; Enter submits.

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Pencil } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
  // Status isn't chosen here anymore — the timeline checkbox is the source of
  // truth. New entries default to "to apply"; tick the checkbox once applied.
  const status: ApplicationStatus = 'to_apply'
  const [fetched, setFetched] = useState<JobDetails | null>(null)
  const [fetching, setFetching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Company/role editor is collapsed by default; the edit icon reveals it.
  const [showFields, setShowFields] = useState(false)
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
  // Metadata came back clean — colour the submit button green as a success cue.
  const fetchedOk = isUrl && fetched?.source === 'metadata'
  // Once a fetch settles (or for plain non-URL input), offer the edit toggle.
  const canEdit = hasInput && !fetching

  function reset() {
    setRaw('')
    setCompany('')
    setRole('')
    setFetched(null)
    setFetching(false)
    setShowFields(false)
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
    if (e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }

  const submitLabel = 'Save to apply'

  return (
    <div onKeyDown={onKeyDown} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {/* layout: input width animates down as the edit button mounts in. */}
        <motion.div layout className="min-w-0 flex-1">
          <Input
            ref={inputRef}
            value={raw}
            onChange={(e) => onRawChange(e.target.value)}
            placeholder="Paste a job URL or type a company…"
            size="lg"
            autoFocus
            aria-label="Job URL or company"
            className="w-full"
          />
        </motion.div>
        {/* Edit toggle — appears once a fetch settles. Reveals company/title.
            Scale/fade in (no width animation — that clips the icon in flex). */}
        <AnimatePresence initial={false} mode="popLayout">
          {canEdit && (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              <Button
                type="button"
                size="icon-lg"
                variant={showFields ? 'secondary' : 'outline'}
                onClick={() => setShowFields((v) => !v)}
                aria-label="Edit company and title"
                aria-pressed={showFields}
                title="Edit company and title"
              >
                <Pencil />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        <Button
          size="icon-lg"
          onClick={() => void submit()}
          loading={submitting || fetching}
          disabled={!canSubmit}
          aria-label={submitLabel}
          title={submitLabel}
          className={
            fetchedOk && !submitting
              ? 'border-transparent bg-green-600 text-white hover:bg-green-600/90'
              : undefined
          }
        >
          <ArrowRight />
        </Button>
      </div>

      {/* Editable company + role, prefilled by the best available guess */}
      <AnimatePresence initial={false}>
        {showFields && hasInput && (
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
    </div>
  )
}
