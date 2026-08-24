// Tag normalization + derivation.
//
// Tags are freeform, which means the same label will be typed five different
// ways ("Remote", " remote", "#remote"). Everything funnels through
// normalizeTag on the way in so the suggestion list stays short and filtering
// by a tag actually matches every row that meant it.

import type { Application } from './types'

const MAX_TAG_LENGTH = 24

// Lowercase, trimmed, inner whitespace collapsed to single hyphens, leading
// '#' dropped (people type it out of habit). Returns '' for anything that
// normalizes to nothing — callers treat that as "not a tag".
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .slice(0, MAX_TAG_LENGTH)
}

// Normalize a whole list, dropping empties and duplicates while preserving the
// order the user added them.
export function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of raw) {
    const tag = normalizeTag(t)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
  }
  return out
}

// Every tag in use, most-used first then alphabetical. This is the suggestion
// list: it's derived from the loaded rows rather than stored separately, so
// there's no vocabulary to keep in sync and a tag disappears on its own once
// the last row using it drops it.
export function allTags(apps: Application[]): string[] {
  const counts = new Map<string, number>()
  for (const a of apps) {
    for (const t of a.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag)
}
