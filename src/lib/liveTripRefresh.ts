/**
 * Keep dispatcher trip/offer views fresh without a manual browser refresh.
 * Polls hydrateTrips + ADS-B actuals for live tails while a page is mounted.
 */

import { canPersist } from '@/lib/db/client'

const DEFAULT_MS = 4000
/** ADS-B AeroAPI — poll less often than hydrate. */
const ADSB_EVERY_N = 4

/**
 * Start a background trip hydrate loop. Returns a disposer.
 * No-ops when Supabase is not configured.
 */
export function startLiveTripRefresh(intervalMs = DEFAULT_MS): () => void {
  if (!canPersist() || typeof window === 'undefined') {
    return () => {}
  }
  let stopped = false
  let inFlight = false
  let tickCount = 0

  const tick = () => {
    if (stopped || inFlight) return
    inFlight = true
    tickCount += 1
    const runAdsb = tickCount % ADSB_EVERY_N === 1
    void import('@/lib/db/hydrateTrips')
      .then(async (m) => {
        await m.hydrateTrips()
        if (!runAdsb || stopped) return
        const { listTripsStable } = await import('@/lib/tripStore')
        const { refreshAdsbActualsForLiveTrips } = await import(
          '@/lib/applyAdsbActuals'
        )
        await refreshAdsbActualsForLiveTrips(listTripsStable())
      })
      .catch((e) => console.warn('[liveTripRefresh]', e))
      .finally(() => {
        inFlight = false
      })
  }

  tick()
  const id = window.setInterval(tick, Math.max(2000, intervalMs))
  return () => {
    stopped = true
    window.clearInterval(id)
  }
}
