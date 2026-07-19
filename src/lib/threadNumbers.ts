/**
 * Assign / release dedicated trip thread numbers (DID pool).
 */

import { canPersist, db, safeQuery } from '@/lib/db/client'

export type ThreadNumberRow = {
  id: string
  e164: string
  label: string
  trip_id: string | null
}

export async function assignTripThreadNumber(
  tripId: string,
): Promise<ThreadNumberRow | null> {
  if (!canPersist()) {
    // Offline / mock: deterministic placeholder
    return {
      id: crypto.randomUUID(),
      e164: `+1555${tripId.replace(/\D/g, '').slice(0, 7).padEnd(7, '0')}`,
      label: 'Mock trip line',
      trip_id: tripId,
    }
  }
  const row = await safeQuery<ThreadNumberRow>('assign_thread_number', () =>
    db().rpc('assign_thread_number', { p_trip_id: tripId }).maybeSingle(),
  )
  if (row && typeof row === 'object' && 'e164' in row) {
    return {
      id: String(row.id),
      e164: String(row.e164),
      label: String(row.label ?? ''),
      trip_id: tripId,
    }
  }
  return null
}

export async function releaseTripThreadNumber(tripId: string): Promise<void> {
  if (!canPersist()) return
  await safeQuery('release_thread_number', () =>
    db().rpc('release_thread_number', { p_trip_id: tripId }),
  )
}
