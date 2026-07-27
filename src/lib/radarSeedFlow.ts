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
import { listWatchedTails } from '@/lib/watchedTailsStore'

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
  // Live FA with no hit stays laddBlocked (flag, don't invent).
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
