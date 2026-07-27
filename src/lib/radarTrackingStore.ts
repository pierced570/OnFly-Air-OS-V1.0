/**
 * Last-known positions + which tails have movement alerts enabled.
 * localStorage first; best-effort Supabase when live.
 */

import {
  applyAlertToggle,
  applySeedHit,
  emptyTrack,
  normalizeTail,
  type RadarLastKnown,
  type RadarTailTrack,
} from '@/domain/radarTracking'
import { canPersist, db, safeQuery } from '@/lib/db/client'

const STORAGE_KEY = 'onfly.radarTracked.v1'

const byTail = new Map<string, RadarTailTrack>()
const listeners = new Set<() => void>()
let snapshot: RadarTailTrack[] = []
let hydrated = false

function rebuild() {
  snapshot = [...byTail.values()].sort((a, b) => a.tail.localeCompare(b.tail))
}

function bump() {
  rebuild()
  persistLocal()
  for (const l of listeners) l()
}

function persistLocal() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...byTail.values()]))
  } catch {
    /* ignore */
  }
}

function loadLocal() {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const rows = JSON.parse(raw) as RadarTailTrack[]
    if (!Array.isArray(rows)) return
    for (const r of rows) {
      const tail = normalizeTail(r.tail)
      if (!tail) continue
      byTail.set(tail, { ...r, tail })
    }
  } catch {
    /* ignore */
  }
}

loadLocal()
rebuild()

function rowFromDb(r: {
  tail: string
  alert_enabled: boolean
  provider_alert_id: string | null
  last_lat: number | null
  last_lon: number | null
  last_alt: number | null
  last_gs: number | null
  last_seen_at: string | null
  last_takeoff_at: string | null
  last_landing_at: string | null
  phase: string | null
  ladd_blocked: boolean
  seeded_at: string | null
  updated_at: string
}): RadarTailTrack {
  const hasPos = r.last_lat != null && r.last_lon != null
  const lastKnown: RadarLastKnown | null = hasPos
    ? {
        lat: Number(r.last_lat),
        lon: Number(r.last_lon),
        alt: Number(r.last_alt ?? 0),
        gs: Number(r.last_gs ?? 0),
        seenAt: r.last_seen_at ?? r.updated_at,
        phase:
          r.phase === 'airborne' || r.phase === 'on_ground' || r.phase === 'no_data'
            ? r.phase
            : 'no_data',
        laddBlocked: Boolean(r.ladd_blocked),
        lastTakeoffAt: r.last_takeoff_at,
        lastLandingAt: r.last_landing_at,
      }
    : null
  return {
    tail: normalizeTail(r.tail),
    alertEnabled: Boolean(r.alert_enabled),
    providerAlertId: r.provider_alert_id,
    lastKnown,
    seededAt: r.seeded_at,
    updatedAt: r.updated_at,
  }
}

function toDb(row: RadarTailTrack) {
  const k = row.lastKnown
  return {
    tail: row.tail,
    alert_enabled: row.alertEnabled,
    provider_alert_id: row.providerAlertId,
    last_lat: k?.lat ?? null,
    last_lon: k?.lon ?? null,
    last_alt: k?.alt ?? null,
    last_gs: k?.gs ?? null,
    last_seen_at: k?.seenAt ?? null,
    last_takeoff_at: k?.lastTakeoffAt ?? null,
    last_landing_at: k?.lastLandingAt ?? null,
    phase: k?.phase ?? null,
    ladd_blocked: k?.laddBlocked ?? true,
    seeded_at: row.seededAt,
    updated_at: row.updatedAt,
  }
}

async function persistRow(row: RadarTailTrack) {
  if (!canPersist()) return
  await safeQuery('radar_tracked_tails.upsert', () =>
    db()
      .from('radar_tracked_tails')
      .upsert(toDb(row), { onConflict: 'tail' }),
  )
}

export function subscribeRadarTracks(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listRadarTracks(): RadarTailTrack[] {
  return snapshot
}

export function getRadarTrack(tail: string): RadarTailTrack | undefined {
  return byTail.get(normalizeTail(tail))
}

export function ensureRadarTrack(tail: string): RadarTailTrack {
  const t = normalizeTail(tail)
  const existing = byTail.get(t)
  if (existing) return existing
  const row = emptyTrack(t)
  byTail.set(t, row)
  bump()
  void persistRow(row)
  return row
}

export function upsertRadarLastKnown(
  tail: string,
  known: RadarLastKnown,
): RadarTailTrack {
  const t = normalizeTail(tail)
  const prev = byTail.get(t) ?? emptyTrack(t)
  const next = applySeedHit(prev, known)
  byTail.set(t, next)
  bump()
  void persistRow(next)
  return next
}

export function setRadarAlertLocal(
  tail: string,
  enabled: boolean,
  providerAlertId: string | null = null,
): RadarTailTrack {
  const t = normalizeTail(tail)
  const prev = byTail.get(t) ?? emptyTrack(t)
  const next = applyAlertToggle(prev, enabled, { providerAlertId })
  byTail.set(t, next)
  bump()
  void persistRow(next)
  return next
}

/** Hydrate from Supabase once (non-blocking callers). */
export async function hydrateRadarTracks(): Promise<number> {
  if (!canPersist()) {
    hydrated = true
    return byTail.size
  }
  const rows = await safeQuery<
    Array<{
      tail: string
      alert_enabled: boolean
      provider_alert_id: string | null
      last_lat: number | null
      last_lon: number | null
      last_alt: number | null
      last_gs: number | null
      last_seen_at: string | null
      last_takeoff_at: string | null
      last_landing_at: string | null
      phase: string | null
      ladd_blocked: boolean
      seeded_at: string | null
      updated_at: string
    }>
  >('radar_tracked_tails.select', () =>
    db().from('radar_tracked_tails').select('*'),
  )
  if (rows?.length) {
    for (const r of rows) {
      const parsed = rowFromDb(r)
      const local = byTail.get(parsed.tail)
      if (
        local &&
        Date.parse(local.updatedAt) > Date.parse(parsed.updatedAt)
      ) {
        continue
      }
      byTail.set(parsed.tail, parsed)
    }
    bump()
  }
  hydrated = true
  return byTail.size
}

export function isRadarTracksHydrated(): boolean {
  return hydrated
}

/** Test-only. */
export function _resetRadarTracksForTests() {
  byTail.clear()
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
  hydrated = false
  bump()
}
