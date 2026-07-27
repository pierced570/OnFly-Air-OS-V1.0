/**
 * Resolve a display client name for Dispatch / docs.
 * Prefers denormalized trip.client_name, then quick, directory, events, participants.
 */

import type { TripStoreRow } from '@/lib/tripStore'

const CLIENT_ROLES = new Set([
  'client',
  'client_ap',
  'client_supply',
  'requester',
])

export function resolveTripClientName(
  trip: Pick<
    TripStoreRow,
    'client_name' | 'quick' | 'events' | 'participants'
  > & { client_id?: string | null },
  directoryName?: string | null,
): string {
  const fromTrip = trip.client_name?.trim()
  if (fromTrip) return fromTrip
  const fromQuick = trip.quick?.client_name?.trim()
  if (fromQuick) return fromQuick
  const fromDir = directoryName?.trim()
  if (fromDir) return fromDir
  for (let i = (trip.events?.length ?? 0) - 1; i >= 0; i--) {
    const ev = trip.events![i]!
    const n = ev.payload?.client_name
    if (typeof n === 'string' && n.trim()) return n.trim()
  }
  for (const p of trip.participants ?? []) {
    if (!CLIENT_ROLES.has(p.role)) continue
    const company = p.company?.trim()
    if (company) return company
    const name = p.name?.trim()
    if (name) return name
  }
  return ''
}
