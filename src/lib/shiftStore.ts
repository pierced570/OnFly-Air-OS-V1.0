/**
 * On-shift dispatcher window (schema: shifts) — syncs to Supabase when configured.
 */

export type ShiftRow = {
  id: string
  person_name: string
  phone: string
  started_at: string
  ended_at: string | null
  notes: string
}

let current: ShiftRow | null = null
const history: ShiftRow[] = []
const listeners = new Set<() => void>()

function bump() {
  for (const l of listeners) l()
}

export function subscribeShift(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getOnShift(): ShiftRow | null {
  return current
}

export function listShiftHistory(): ShiftRow[] {
  return [...history].reverse()
}

export function hydrateShiftFromDb(row: ShiftRow): void {
  current = row
  bump()
}

export function startShift(person_name: string, phone: string, notes = ''): ShiftRow {
  if (current) {
    current.ended_at = new Date().toISOString()
    history.push(current)
    void import('@/lib/db/persist').then((m) => m.persistShiftEnd(current!.id))
  }
  current = {
    id: crypto.randomUUID(),
    person_name: person_name.trim(),
    phone: phone.trim(),
    started_at: new Date().toISOString(),
    ended_at: null,
    notes: notes.trim(),
  }
  bump()
  void import('@/lib/db/persist').then((m) => m.persistShiftStart(current!))
  return current
}

export function endShift(): void {
  if (!current) return
  const id = current.id
  current.ended_at = new Date().toISOString()
  history.push(current)
  current = null
  bump()
  void import('@/lib/db/persist').then((m) => m.persistShiftEnd(id))
}

export function updateShiftNotes(notes: string): void {
  if (!current) return
  current.notes = notes
  bump()
}
