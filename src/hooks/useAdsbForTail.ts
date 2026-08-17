/**
 * Poll FlightAware / ADS-B for one dispatched (live) trip tail.
 * Do not call for booked / list cards / fleet-wide — AeroAPI spend is per request.
 * Portal track fetches a live lock immediately on access, then polls.
 */

import { useEffect, useState } from 'react'
import { createAdsbAdapter, type AdsbPosition } from '@/adapters/adsb'
import {
  ADSB_USABLE_FIX_MAX_AGE_MIN,
  adsbFixIsFresh,
} from '@/domain/adsbFreshness'

const REFRESH_MS = 30_000

function normalizeTail(tail: string | null | undefined): string | null {
  const t = (tail ?? '').trim().toUpperCase()
  if (!t || t === 'TBD' || t === '—') return null
  return t
}

function hasFix(p: AdsbPosition | null | undefined): boolean {
  if (!p || p.phase === 'no_data' || p.laddBlocked) return false
  return !(p.lat === 0 && p.lon === 0)
}

function usableFix(p: AdsbPosition, nowMs: number): boolean {
  return (
    hasFix(p) &&
    adsbFixIsFresh(p.seenAt, nowMs, ADSB_USABLE_FIX_MAX_AGE_MIN)
  )
}

function stripStaleFix(p: AdsbPosition): AdsbPosition {
  if (!hasFix(p)) return p
  return { ...p, lat: 0, lon: 0, alt: 0, gs: 0, phase: 'no_data' }
}

function mergeActuals(base: AdsbPosition, other: AdsbPosition): AdsbPosition {
  return {
    ...base,
    lastTakeoffAt: base.lastTakeoffAt ?? other.lastTakeoffAt,
    lastLandingAt: base.lastLandingAt ?? other.lastLandingAt,
    takeoffIsActual: Boolean(base.takeoffIsActual || other.takeoffIsActual),
    landingIsActual: Boolean(base.landingIsActual || other.landingIsActual),
    originIcao: base.originIcao ?? other.originIcao,
    destinationIcao: base.destinationIcao ?? other.destinationIcao,
  }
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
 * On mount: live positions first (portal open). Seed only if live has no fix.
 * Then poll positions. Disabled = no provider calls.
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

    const apply = (rows: AdsbPosition[], nowMs = Date.now()) => {
      if (cancelled) return
      const hit = rows[0] ?? null
      if (!hit) return
      setPos((prev) => mergeAdsbPreferRicher(prev, hit, nowMs))
    }

    const tick = async (onAccess: boolean) => {
      try {
        const live = await adapter.positions([key], { liveLock: onAccess })
        if (cancelled) return
        apply(live)
        if (onAccess && !hasFix(live[0])) {
          const seeded = await adapter.seedLastKnown([key])
          if (cancelled) return
          apply(seeded)
        }
      } catch {
        if (!cancelled && !onAccess) setPos(null)
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

/** Keep takeoff/landing actuals if a thinner poll drops them. Drop stale seeds. */
export function mergeAdsbPreferRicher(
  prev: AdsbPosition | null,
  next: AdsbPosition,
  nowMs: number = Date.now(),
): AdsbPosition {
  if (!prev || prev.tail.toUpperCase() !== next.tail.toUpperCase()) {
    return usableFix(next, nowMs) ? next : stripStaleFix(next)
  }

  const nextOk = usableFix(next, nowMs)
  const prevOk = usableFix(prev, nowMs)
  if (nextOk) return mergeActuals(next, prev)
  if (prevOk) return mergeActuals(prev, next)
  return stripStaleFix(next)
}
