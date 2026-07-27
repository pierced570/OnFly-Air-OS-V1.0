/**
 * Radar alert watchlist — which tails get movement alerts after last-known seed.
 * Pure domain: no React / Supabase.
 */

export type RadarTrackPhase = 'airborne' | 'on_ground' | 'no_data'

export type RadarLastKnown = {
  lat: number
  lon: number
  alt: number
  gs: number
  seenAt: string
  phase: RadarTrackPhase
  laddBlocked: boolean
  lastTakeoffAt: string | null
  lastLandingAt: string | null
}

export type RadarTailTrack = {
  tail: string
  /** Dispatcher opted this tail into FlightAware movement alerts. */
  alertEnabled: boolean
  /** Provider alert id when registered (FlightAware integer as string). */
  providerAlertId: string | null
  lastKnown: RadarLastKnown | null
  seededAt: string | null
  updatedAt: string
}

export function normalizeTail(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
}

/** Chunks for seed / poll batching (edge rate limits). */
export function chunkTails(tails: string[], size = 40): string[][] {
  const clean = [...new Set(tails.map(normalizeTail).filter(Boolean))]
  const out: string[][] = []
  for (let i = 0; i < clean.length; i += size) {
    out.push(clean.slice(i, i + size))
  }
  return out
}

export function mergeLastKnown(
  prev: RadarLastKnown | null,
  next: RadarLastKnown,
): RadarLastKnown {
  if (!prev) return next
  const prevTs = Date.parse(prev.seenAt) || 0
  const nextTs = Date.parse(next.seenAt) || 0
  return nextTs >= prevTs ? next : prev
}

export function applyAlertToggle(
  row: RadarTailTrack,
  enabled: boolean,
  opts?: { providerAlertId?: string | null; nowIso?: string },
): RadarTailTrack {
  const now = opts?.nowIso ?? new Date().toISOString()
  return {
    ...row,
    alertEnabled: enabled,
    providerAlertId: enabled
      ? (opts?.providerAlertId ?? row.providerAlertId)
      : null,
    updatedAt: now,
  }
}

export function emptyTrack(
  tail: string,
  nowIso = new Date().toISOString(),
): RadarTailTrack {
  return {
    tail: normalizeTail(tail),
    alertEnabled: false,
    providerAlertId: null,
    lastKnown: null,
    seededAt: null,
    updatedAt: nowIso,
  }
}

export function applySeedHit(
  row: RadarTailTrack,
  known: RadarLastKnown,
  nowIso = new Date().toISOString(),
): RadarTailTrack {
  return {
    ...row,
    lastKnown: mergeLastKnown(row.lastKnown, known),
    seededAt: row.seededAt ?? nowIso,
    updatedAt: nowIso,
  }
}

export function alertEnabledTails(rows: RadarTailTrack[]): string[] {
  return rows.filter((r) => r.alertEnabled).map((r) => r.tail)
}

export function seededCount(rows: RadarTailTrack[]): number {
  return rows.filter((r) => r.lastKnown != null && !r.lastKnown.laddBlocked)
    .length
}

export function trackingSummary(rows: RadarTailTrack[]): {
  total: number
  seeded: number
  alertOn: number
} {
  return {
    total: rows.length,
    seeded: seededCount(rows),
    alertOn: alertEnabledTails(rows).length,
  }
}
