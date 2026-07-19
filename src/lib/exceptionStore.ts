/**
 * Checkpoint / exception queue for the Board (mock watchdogs).
 */

export type ExceptionCard = {
  id: string
  trip_id: string | null
  trip_ref: number | null
  title: string
  detail: string
  severity: 'late' | 'attn'
  created_at: string
  acknowledged: boolean
}

const cards = new Map<string, ExceptionCard>()
const listeners = new Set<() => void>()
let snapshot: ExceptionCard[] = []

function rebuild() {
  snapshot = [...cards.values()]
    .filter((c) => !c.acknowledged)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

function bump() {
  rebuild()
  for (const l of listeners) l()
}

export function subscribeExceptions(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listExceptions(): ExceptionCard[] {
  return snapshot
}

export function raiseException(
  partial: Omit<ExceptionCard, 'id' | 'created_at' | 'acknowledged'>,
): ExceptionCard {
  const dup = [...cards.values()].find(
    (c) =>
      !c.acknowledged &&
      c.title === partial.title &&
      c.detail === partial.detail,
  )
  if (dup) return dup
  const row: ExceptionCard = {
    ...partial,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    acknowledged: false,
  }
  cards.set(row.id, row)
  bump()
  return row
}

export function acknowledgeException(id: string): void {
  const row = cards.get(id)
  if (!row) return
  row.acknowledged = true
  bump()
}

/** Seed demo exceptions from active trips that look overdue / need attention. */
export function syncExceptionsFromTrips(
  trips: Array<{
    id: string
    ref: number
    state: string
    ready_label: string
    quick?: { timing: string } | undefined
  }>,
): void {
  let changed = false
  for (const t of trips) {
    if (t.state !== 'booked' && t.state !== 'in_progress') continue
    const key = `watch-${t.id}`
    if ([...cards.values()].some((c) => c.id === key || c.trip_id === t.id))
      continue
    if (t.quick?.timing === 'asap' || t.ready_label === 'ASAP') {
      cards.set(key, {
        id: key,
        trip_id: t.id,
        trip_ref: t.ref,
        title: `ASAP watch · T-${t.ref}`,
        detail:
          'Checkpoint: confirm positioning / pickup within slip threshold.',
        severity: 'attn',
        created_at: new Date().toISOString(),
        acknowledged: false,
      })
      changed = true
    }
  }
  // Only notify when something new was added — always-bump caused Board re-render storms.
  if (changed) bump()
}
