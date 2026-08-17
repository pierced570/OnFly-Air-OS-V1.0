/**
 * Resolve the client's last purchase order from recorded history.
 * Pure TypeScript — no React / Supabase.
 */

import { extractPoNumeric } from '@/domain/qbInvoice'

export type ClientPoCandidate = {
  po: string
  /** ISO date or sortable string — later wins ties. */
  sortKey?: string | null
  tripRef?: string | null
}

export type ResolvedClientLastPo = {
  lastPo: string
  tripRef: string | null
  numeric: number | null
}

/** Strip leading "PO #" / "PO " for storage + comparison. */
export function normalizeClientPo(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/^PO\s*#?\s*/i, '').trim()
}

/**
 * Pick the strongest prior PO from candidates.
 * Prefers the most recent dated entry; falls back to highest numeric.
 */
export function pickLatestClientPo(
  candidates: ClientPoCandidate[],
): ResolvedClientLastPo | null {
  const usable = candidates
    .map((c) => ({
      po: normalizeClientPo(c.po),
      sortKey: (c.sortKey ?? '').trim(),
      tripRef: c.tripRef?.trim() || null,
      numeric: extractPoNumeric(normalizeClientPo(c.po)),
    }))
    .filter((c) => c.po)

  if (!usable.length) return null

  const dated = usable.filter((c) => c.sortKey)
  const pool = dated.length ? dated : usable

  pool.sort((a, b) => {
    if (a.sortKey && b.sortKey && a.sortKey !== b.sortKey) {
      return a.sortKey < b.sortKey ? 1 : -1 // later first
    }
    const an = a.numeric
    const bn = b.numeric
    if (an != null && bn != null && an !== bn) return bn - an
    if (an != null && bn == null) return -1
    if (an == null && bn != null) return 1
    return 0
  })

  const best = pool[0]!
  return {
    lastPo: best.po,
    tripRef: best.tripRef,
    numeric: best.numeric,
  }
}
