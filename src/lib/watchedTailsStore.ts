/**
 * Tails under ADS-B watch — filled via syncWatchedFromFleet / D085 confirm.
 * Does not import the large network.json fixture on boot.
 */

export type WatchedTail = {
  tail: string
  type_name: string | null
  operator_name: string
  operator_id: string | null
  base_icao: string | null
  source: 'network' | 'd085' | 'manual'
  added_at: string
}

const byTail = new Map<string, WatchedTail>()
const listeners = new Set<() => void>()
let snapshot: WatchedTail[] = []

function rebuild() {
  snapshot = [...byTail.values()].sort((a, b) => a.tail.localeCompare(b.tail))
}

function bump() {
  rebuild()
  for (const l of listeners) l()
}

rebuild()

/** Reconcile watch list with live Network fleet (DB or fixture). */
export function syncWatchedFromFleet(
  aircraft: Array<{
    tail: string
    type_name: string | null
    operator_name: string
    operator_id: string
    base_icao: string | null
  }>,
): void {
  const now = new Date().toISOString()
  let changed = false
  for (const a of aircraft) {
    const tail = String(a.tail ?? '').toUpperCase()
    if (!tail || tail.startsWith('TBD')) continue
    const existing = byTail.get(tail)
    if (existing?.source === 'd085') {
      byTail.set(tail, {
        ...existing,
        type_name: a.type_name ?? existing.type_name,
        base_icao: a.base_icao ?? existing.base_icao,
        operator_name: a.operator_name || existing.operator_name,
        operator_id: a.operator_id || existing.operator_id,
      })
      changed = true
      continue
    }
    byTail.set(tail, {
      tail,
      type_name: a.type_name,
      operator_name: a.operator_name,
      operator_id: a.operator_id,
      base_icao: a.base_icao,
      source: 'network',
      added_at: existing?.added_at ?? now,
    })
    changed = true
  }
  if (changed) bump()
}

export function subscribeWatchedTails(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listWatchedTails(): WatchedTail[] {
  return snapshot
}

export function watchTail(
  partial: Omit<WatchedTail, 'added_at'> & { added_at?: string },
): void {
  const tail = partial.tail.toUpperCase()
  const existing = byTail.get(tail)
  byTail.set(tail, {
    ...existing,
    ...partial,
    tail,
    added_at: existing?.added_at ?? partial.added_at ?? new Date().toISOString(),
  })
  bump()
}

/** After D085 review confirm — register every selected tail for radar. */
export function watchTailsFromD085(opts: {
  operator_id: string
  operator_name: string
  base_icao: string
  aircraft: Array<{ tail: string; type_name: string }>
}): void {
  for (const a of opts.aircraft) {
    if (!a.tail.trim()) continue
    watchTail({
      tail: a.tail.trim().toUpperCase(),
      type_name: a.type_name || null,
      operator_name: opts.operator_name,
      operator_id: opts.operator_id,
      base_icao: opts.base_icao || null,
      source: 'd085',
    })
  }
}
