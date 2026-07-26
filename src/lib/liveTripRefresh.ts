/**
 * Keep dispatcher trip/offer views fresh without a manual browser refresh.
 * Polls hydrateTrips while a page is mounted (Supabase realtime not required).
 */

import { canPersist } from '@/lib/db/client'

const DEFAULT_MS = 4000

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

  const tick = () => {
    if (stopped || inFlight) return
    inFlight = true
    void import('@/lib/db/hydrateTrips')
      .then((m) => m.hydrateTrips())
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
