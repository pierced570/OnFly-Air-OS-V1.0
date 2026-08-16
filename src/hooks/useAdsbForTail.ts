/**
 * Poll FlightAware / ADS-B for a trip tail — seed last-known, then live positions.
 */

import { useEffect, useState } from 'react'
import { createAdsbAdapter, type AdsbPosition } from '@/adapters/adsb'

const REFRESH_MS = 30_000

function normalizeTail(tail: string | null | undefined): string | null {
  const t = (tail ?? '').trim().toUpperCase()
  if (!t || t === 'TBD' || t === '—') return null
  return t
}

/**
 * Live + last-known ADS-B for one registration (portal / home cards).
 * Seeds first so takeoff/landing stamps appear before the next poll.
 */
export function useAdsbForTail(
  tail: string | null | undefined,
): AdsbPosition | null {
  const [pos, setPos] = useState<AdsbPosition | null>(null)
  const key = normalizeTail(tail)

  useEffect(() => {
    if (!key) {
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
          const seeded = await adapter.seedLastKnown([key])
          apply(seeded)
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
  }, [key])

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
