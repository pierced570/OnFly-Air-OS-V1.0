/**
 * How fresh an ADS-B / AeroAPI fix must be to count as a live portal lock.
 * Pure TS — keep pickFaFlightForTrack in sync with adsb-positions edge.
 */

/** Shown as LIVE on the portal (radar still moving). */
export const ADSB_LIVE_LOCK_MAX_AGE_MIN = 20

/**
 * Usable last-known on the map (parked same day). Older than this is a
 * historical flight — do not pin it as the aircraft's current position.
 */
export const ADSB_USABLE_FIX_MAX_AGE_MIN = 6 * 60

export type FaFlightPickInput = {
  status?: string | null
  actual_off?: string | null
  actual_on?: string | null
  last_position?: { timestamp?: string | null } | null
}

export function adsbAgeMin(
  seenAt: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!seenAt) return null
  const t = Date.parse(seenAt)
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.round((nowMs - t) / 60_000))
}

export function adsbFixIsFresh(
  seenAt: string | null | undefined,
  nowMs: number = Date.now(),
  maxAgeMin: number = ADSB_LIVE_LOCK_MAX_AGE_MIN,
): boolean {
  const age = adsbAgeMin(seenAt, nowMs)
  return age != null && age <= maxAgeMin
}

/** True when the portal should say Live (not a days-old last flight). */
export function adsbIsLiveLock(
  seenAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  return adsbFixIsFresh(seenAt, nowMs, ADSB_LIVE_LOCK_MAX_AGE_MIN)
}

export function faFlightLooksAirborne(f: FaFlightPickInput): boolean {
  const s = String(f.status ?? '').toLowerCase()
  return (
    s.includes('en route') ||
    s.includes('airborne') ||
    s.includes('taxi') ||
    (Boolean(f.actual_off) && !f.actual_on)
  )
}

/**
 * AeroAPI `/flights/{ident}` is ~14 days of flights ordered by scheduled_out.
 * Never blindly take flights[0] — that is often a completed hop from days ago.
 */
export function pickFaFlightForTrack<T extends FaFlightPickInput>(
  flights: T[],
  opts: { seed: boolean; nowMs?: number },
): T | undefined {
  if (!flights.length) return undefined
  const nowMs = opts.nowMs ?? Date.now()
  const active = flights.find((f) => faFlightLooksAirborne(f))
  if (active) return active
  const recentlyArrived = flights.find((f) => {
    const on = f.actual_on ? Date.parse(f.actual_on) : NaN
    return Number.isFinite(on) && nowMs - on < 6 * 60 * 60 * 1000
  })
  if (recentlyArrived) return recentlyArrived
  if (!opts.seed) {
    const withFix = flights.find(
      (f) => Boolean(f.last_position?.timestamp) || Boolean(f.actual_on),
    )
    if (!withFix) return undefined
    const ts = withFix.last_position?.timestamp || withFix.actual_on
    const t = ts ? Date.parse(ts) : NaN
    if (Number.isFinite(t) && nowMs - t < 6 * 60 * 60 * 1000) return withFix
    return undefined
  }
  return (
    flights.find(
      (f) =>
        Boolean(f.actual_on || f.actual_off || f.last_position?.timestamp),
    ) ?? flights[0]
  )
}
