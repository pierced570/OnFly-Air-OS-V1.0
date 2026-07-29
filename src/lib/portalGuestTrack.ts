/**
 * Magic-link guests aren't signed in — remember the last track token so
 * "← All shipments" can show that trip instead of an empty Welcome wall.
 */

const KEY = 'onfly.portal.guestTrack.v1'

export type PortalGuestTrack = {
  token: string
  tripId: string
  at: string
}

export function rememberPortalGuestTrack(opts: {
  token: string
  tripId: string
}): void {
  if (typeof sessionStorage === 'undefined') return
  const token = opts.token.trim()
  const tripId = opts.tripId.trim()
  if (!token || !tripId) return
  const row: PortalGuestTrack = {
    token,
    tripId,
    at: new Date().toISOString(),
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(row))
  } catch {
    /* private mode */
  }
}

export function readPortalGuestTrack(): PortalGuestTrack | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const row = JSON.parse(raw) as PortalGuestTrack
    if (!row?.token || !row?.tripId) return null
    return row
  } catch {
    return null
  }
}

export function clearPortalGuestTrack(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
