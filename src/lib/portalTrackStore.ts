/**
 * Portal track magic links — session Map + durable Supabase portal_track_tokens.
 */

import { canPersist, db, safeQuery } from '@/lib/db/client'

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
  const row: PortalTrackRow = {
    token,
    tripId: opts.tripId,
    email,
    createdAt: new Date().toISOString(),
  }
  byToken.set(token, row)
  void import('@/lib/db/persistTrip').then((m) =>
    m.persistPortalTrackToken({
      token,
      tripId: opts.tripId,
      email,
    }),
  )
  return token
}

export function getOrCreatePortalTrackToken(opts: {
  tripId: string
  email: string
}): string {
  for (const row of byToken.values()) {
    if (row.tripId === opts.tripId) return row.token
  }
  return createPortalTrackToken(opts)
}

export function getPortalTrackRow(token: string): PortalTrackRow | null {
  return byToken.get(token) ?? null
}

/** Resolve token from session or Supabase (survives refresh). */
export async function resolvePortalTrackTripId(
  token: string,
): Promise<string | null> {
  const local = getPortalTrackTripId(token)
  if (local) return local
  if (!canPersist() || !token.trim()) return null

  const row = await safeQuery<{ trip_id: string }>('portal_track_tokens', () =>
    db()
      .from('portal_track_tokens')
      .select('trip_id')
      .eq('token', token)
      .maybeSingle(),
  )
  if (row && typeof row === 'object' && 'trip_id' in row) {
    const tripId = String(row.trip_id)
    byToken.set(token, {
      token,
      tripId,
      email: '',
      createdAt: new Date().toISOString(),
    })
    return tripId
  }

  // SECURITY DEFINER fallback when token table RLS differs
  const viaRpc = await safeQuery<{ id: string }[]>('portal_trip_by_token', () =>
    db().rpc('portal_trip_by_token', { p_token: token }),
  )
  if (Array.isArray(viaRpc) && viaRpc[0]?.id) {
    const tripId = String(viaRpc[0].id)
    byToken.set(token, {
      token,
      tripId,
      email: '',
      createdAt: new Date().toISOString(),
    })
    return tripId
  }
  return null
}
