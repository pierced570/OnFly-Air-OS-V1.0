/**
 * On-shift dispatcher window (schema: shifts).
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

export function startShift(person_name: string, phone: string, notes = ''): ShiftRow {
  if (current) {
    current.ended_at = new Date().toISOString()
    history.push(current)
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
  return current
}

export function endShift(): void {
  if (!current) return
  current.ended_at = new Date().toISOString()
  history.push(current)
  current = null
  bump()
}

export function updateShiftNotes(notes: string): void {
  if (!current) return
  current.notes = notes
  bump()
}
