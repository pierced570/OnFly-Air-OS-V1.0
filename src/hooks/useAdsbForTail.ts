/**
 * Poll FlightAware / ADS-B for one dispatched (live) trip tail.
 * Do not call for booked / list cards / fleet-wide — AeroAPI spend is per request.
 */

import { useEffect, useState } from 'react'
import { createAdsbAdapter, type AdsbPosition } from '@/adapters/adsb'

const REFRESH_MS = 30_000

function normalizeTail(tail: string | null | undefined): string | null {
  const t = (tail ?? '').trim().toUpperCase()
  if (!t || t === 'TBD' || t === '—') return null
  return t
}

/** Trip states that justify live AeroAPI spend. */
export function adsbPollEnabledForState(
  state: string | null | undefined,
): boolean {
  return state === 'in_progress'
}

export type UseAdsbForTailOpts = {
  /**
   * When false, no seed/positions calls (default true for backwards compat).
   * Portal track should pass trip.state === 'in_progress' only.
   */
  enabled?: boolean
}

/**
 * Live + last-known ADS-B for one registration on a live trip page.
 * Seeds once, then polls positions. Disabled = no provider calls.
 */
export function useAdsbForTail(
  tail: string | null | undefined,
  opts?: UseAdsbForTailOpts,
): AdsbPosition | null {
  const [pos, setPos] = useState<AdsbPosition | null>(null)
  const key = normalizeTail(tail)
  const enabled = opts?.enabled !== false

  useEffect(() => {
    if (!key || !enabled) {
      setPos(null)
      return
    }
    let cancelled = false
    const adapter = createAdsbAdapter()

    const apply = (rows: AdsbPosition[]) => {
      if (cancelled) return
      const hit = rows[0] ?? null
      if (!hit) return
      setPos((prev) => mergeAdsbPreferRicher(prev, hit))
    }

    const tick = async (seedFirst: boolean) => {
      try {
        if (seedFirst) {
          // One historical seed, then live board — not both every interval.
          const seeded = await adapter.seedLastKnown([key])
          apply(seeded)
          return
        }
        const live = await adapter.positions([key])
        apply(live)
      } catch {
        if (!cancelled && !seedFirst) setPos(null)
      }
    }

    void tick(true)
    const id = window.setInterval(() => void tick(false), REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [key, enabled])

  return pos
}

/** Keep takeoff/landing actuals if a thinner poll drops them. */
export function mergeAdsbPreferRicher(
  prev: AdsbPosition | null,
  next: AdsbPosition,
): AdsbPosition {
  if (!prev || prev.tail.toUpperCase() !== next.tail.toUpperCase()) return next
  const nextHasFix =
    !next.laddBlocked &&
    next.phase !== 'no_data' &&
    (next.lat !== 0 || next.lon !== 0)
  const prevHasFix =
    !prev.laddBlocked &&
    prev.phase !== 'no_data' &&
    (prev.lat !== 0 || prev.lon !== 0)
  return {
    ...next,
    lat: nextHasFix ? next.lat : prevHasFix ? prev.lat : next.lat,
    lon: nextHasFix ? next.lon : prevHasFix ? prev.lon : next.lon,
    alt: nextHasFix ? next.alt : prevHasFix ? prev.alt : next.alt,
    gs: nextHasFix ? next.gs : prevHasFix ? prev.gs : next.gs,
    phase: next.phase !== 'no_data' ? next.phase : prev.phase,
    laddBlocked: Boolean(next.laddBlocked),
    lastTakeoffAt: next.lastTakeoffAt ?? prev.lastTakeoffAt,
    lastLandingAt: next.lastLandingAt ?? prev.lastLandingAt,
    takeoffIsActual: next.takeoffIsActual || prev.takeoffIsActual,
    landingIsActual: next.landingIsActual || prev.landingIsActual,
    originIcao: next.originIcao ?? prev.originIcao,
    destinationIcao: next.destinationIcao ?? prev.destinationIcao,
    seenAt:
      nextHasFix || Date.parse(next.seenAt) >= Date.parse(prev.seenAt)
        ? next.seenAt
        : prev.seenAt,
  }
}
