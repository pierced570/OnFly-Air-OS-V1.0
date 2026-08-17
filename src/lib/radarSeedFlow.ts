/**
 * Seed last-known + toggle FlightAware movement alerts from Radar.
 */

import { createAdsbAdapter, isRealAdsbEnabled, type AdsbPosition } from '@/adapters/adsb'
import { lookupAirport } from '@/domain/airports'
import {
  chunkTails,
  trackingSummary,
  type RadarLastKnown,
} from '@/domain/radarTracking'
import {
  ensureRadarTrack,
  getRadarTrack,
  listRadarTracks,
  setRadarAlertLocal,
  upsertRadarLastKnown,
} from '@/lib/radarTrackingStore'
import { listWatchedTails, watchTail } from '@/lib/watchedTailsStore'
import { normalizeTail } from '@/domain/radarTracking'

export type CompanyTailPick = {
  tail: string
  type_name?: string | null
  base_icao?: string | null
}

function positionToKnown(p: AdsbPosition): RadarLastKnown {
  return {
    lat: p.lat,
    lon: p.lon,
    alt: p.alt,
    gs: p.gs,
    seenAt: p.seenAt,
    phase: p.phase ?? (p.laddBlocked ? 'no_data' : 'on_ground'),
    laddBlocked: Boolean(p.laddBlocked),
    lastTakeoffAt: p.lastTakeoffAt ?? null,
    lastLandingAt: p.lastLandingAt ?? null,
  }
}

/** Prefer provider hit; else park at base ICAO so mock/demo still seeds a map point. */
function resolveSeedKnown(
  _tail: string,
  provider: AdsbPosition,
  baseIcao: string | null,
): RadarLastKnown {
  if (!provider.laddBlocked && (provider.lat !== 0 || provider.lon !== 0)) {
    return positionToKnown(provider)
  }
  const ap = baseIcao ? lookupAirport(baseIcao) : null
  // Mock only: park at home base so Radar has a map point before live ADS-B.
  // Live FA with no hit stays no_data (not LADD) — flag, don't invent a block.
  if (ap && !isRealAdsbEnabled()) {
    return {
      lat: ap.lat,
      lon: ap.lon,
      alt: 0,
      gs: 0,
      seenAt: new Date().toISOString(),
      phase: 'on_ground',
      laddBlocked: false,
      lastTakeoffAt: provider.lastTakeoffAt ?? null,
      lastLandingAt: provider.lastLandingAt ?? null,
    }
  }
  return positionToKnown(provider)
}

export type SeedRadarResult = {
  requested: number
  seeded: number
  noData: number
  summary: ReturnType<typeof trackingSummary>
}

/**
 * Ensure company tails are on the watch list, then seed last-known for the
 * selected subset only (no movement-alert toggle). Used by Fleet Radar when
 * dispatch picks individual tails from an operator's fleet.
 */
export async function pollOperatorTailsLastKnown(opts: {
  operator_id: string
  operator_name: string
  base_icao?: string | null
  tails: CompanyTailPick[]
}): Promise<SeedRadarResult> {
  const picks = opts.tails
    .map((a) => ({
      ...a,
      tail: normalizeLookupTail(a.tail),
    }))
    .filter((a) => a.tail)
  for (const a of picks) {
    watchTail({
      tail: a.tail,
      type_name: a.type_name ?? null,
      operator_name: opts.operator_name,
      operator_id: opts.operator_id,
      base_icao: a.base_icao ?? opts.base_icao ?? null,
      source: 'manual',
    })
  }
  return seedRadarLastKnown(picks.map((a) => a.tail))
}

/** Seed last-known for all watched (or provided) tails. */
export async function seedRadarLastKnown(
  tails?: string[],
): Promise<SeedRadarResult> {
  const watched = listWatchedTails()
  const byTail = new Map(watched.map((w) => [w.tail.toUpperCase(), w]))
  const list =
    tails?.map((t) => t.toUpperCase()).filter(Boolean) ??
    watched.map((w) => w.tail)
  const adsb = createAdsbAdapter()
  let seeded = 0
  let noData = 0

  for (const batch of chunkTails(list, 40)) {
    const positions = await adsb.seedLastKnown(batch)
    const byPos = new Map(positions.map((p) => [p.tail.toUpperCase(), p]))
    for (const tail of batch) {
      ensureRadarTrack(tail)
      const w = byTail.get(tail)
      const provider = byPos.get(tail) ?? {
        tail,
        lat: 0,
        lon: 0,
        alt: 0,
        gs: 0,
        seenAt: new Date(0).toISOString(),
        laddBlocked: true,
        phase: 'no_data' as const,
      }
      const known = resolveSeedKnown(tail, provider, w?.base_icao ?? null)
      upsertRadarLastKnown(tail, known)
      if (known.laddBlocked && known.lat === 0 && known.lon === 0) noData += 1
      else seeded += 1
    }
  }

  return {
    requested: list.length,
    seeded,
    noData,
    summary: trackingSummary(listRadarTracks()),
  }
}

export type AlertToggleResult = {
  ok: boolean
  tail: string
  enabled: boolean
  error?: string
}

/** Add or remove a tail from movement-alert tracking. */
export async function setRadarMovementAlert(
  tail: string,
  enabled: boolean,
): Promise<AlertToggleResult> {
  const t = tail.toUpperCase()
  ensureRadarTrack(t)
  const adsb = createAdsbAdapter()
  const res = await adsb.setMovementAlert(t, enabled)
  if (!res.ok) {
    return {
      ok: false,
      tail: t,
      enabled,
      error: res.error ?? 'Alert update failed',
    }
  }
  setRadarAlertLocal(t, enabled, res.alertId ?? null)
  return { ok: true, tail: t, enabled }
}

export function radarAlertEnabled(tail: string): boolean {
  return Boolean(getRadarTrack(tail)?.alertEnabled)
}

/** Normalize user tail input (FlightAware-style): trim, upper, optional leading N. */
export function normalizeLookupTail(raw: string): string {
  let t = normalizeTail(raw).replace(/[^A-Z0-9]/g, '')
  if (!t) return ''
  // Bare numeric / alphanumeric without N — assume US reg
  if (!t.startsWith('N') && /^[0-9]/.test(t)) t = `N${t}`
  return t
}

export type LookupRadarTailResult = {
  tail: string
  known: RadarLastKnown | null
  alertEnabled: boolean
  inNetwork: boolean
  operator_name: string | null
  type_name: string | null
  base_icao: string | null
  error?: string
}

/** One-shot FlightAware-style lookup: seed last-known for a single tail. */
export async function lookupRadarTail(
  rawTail: string,
): Promise<LookupRadarTailResult> {
  const tail = normalizeLookupTail(rawTail)
  if (!tail) {
    return {
      tail: '',
      known: null,
      alertEnabled: false,
      inNetwork: false,
      operator_name: null,
      type_name: null,
      base_icao: null,
      error: 'Enter a tail number (e.g. N159FM)',
    }
  }
  const watched = listWatchedTails().find(
    (w) => w.tail.toUpperCase() === tail,
  )
  await seedRadarLastKnown([tail])
  const track = getRadarTrack(tail)
  return {
    tail,
    known: track?.lastKnown ?? null,
    alertEnabled: Boolean(track?.alertEnabled),
    inNetwork: Boolean(watched),
    operator_name: watched?.operator_name ?? null,
    type_name: watched?.type_name ?? null,
    base_icao: watched?.base_icao ?? null,
  }
}

export type AddTrackingResult = {
  ok: boolean
  tail: string
  error?: string
}

/**
 * Add a tail to active tracking: ensure watch row, seed last-known, enable alert.
 */
export async function addTailToTracking(opts: {
  tail: string
  type_name?: string | null
  operator_name?: string
  operator_id?: string | null
  base_icao?: string | null
}): Promise<AddTrackingResult> {
  const tail = normalizeLookupTail(opts.tail)
  if (!tail) return { ok: false, tail: '', error: 'Tail required' }

  watchTail({
    tail,
    type_name: opts.type_name ?? null,
    operator_name: opts.operator_name ?? '—',
    operator_id: opts.operator_id ?? null,
    base_icao: opts.base_icao ?? null,
    source: 'manual',
  })
  await seedRadarLastKnown([tail])
  const alert = await setRadarMovementAlert(tail, true)
  if (!alert.ok) {
    return {
      ok: false,
      tail,
      error: alert.error ?? 'Could not enable movement alert',
    }
  }
  return { ok: true, tail }
}
