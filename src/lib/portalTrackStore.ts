/**
 * In-memory magic-link mapping for portal tracking.
 * Later: supersede with Supabase + RLS portal_* safe views.
 */

export type PortalTrackRow = {
  token: string
  tripId: string
  email: string
  createdAt: string
}

const byToken = new Map<string, PortalTrackRow>()

export function createPortalTrackToken(opts: {
  tripId: string
  email: string
}): string {
  const email = opts.email.trim().toLowerCase()
  const token = crypto.randomUUID().replace(/-/g, '')
  byToken.set(token, {
    token,
    tripId: opts.tripId,
    email,
    createdAt: new Date().toISOString(),
  })
  return token
}

export function getPortalTrackTripId(token: string): string | null {
  const hit = byToken.get(token)
  return hit?.tripId ?? null
}

export function getPortalTrackRow(token: string): PortalTrackRow | null {
  return byToken.get(token) ?? null
}

