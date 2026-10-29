/**
 * Parse a freeform group of aircraft tails for Radar last-known lookup.
 * Pure TypeScript.
 */

import { normalizeTail } from '@/domain/radarTracking'

/**
 * Split pasted / typed text into unique normalized tails.
 * Accepts whitespace, commas, semicolons, and newlines.
 */
export function parseTailGroup(raw: string | null | undefined): string[] {
  const text = String(raw ?? '')
  if (!text.trim()) return []
  const parts = text.split(/[\s,;|/]+/).filter(Boolean)
  const out: string[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    const tail = normalizeTail(part)
    if (!tail || seen.has(tail)) continue
    seen.add(tail)
    out.push(tail)
  }
  return out
}
