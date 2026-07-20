/**
 * On-shift dispatcher roster (schema: shifts) — multiple people can be on
 * at once. Syncs to Supabase when configured.
 *
 * getOnShift() = primary (most recently started) for notify routing.
 * listOnShift() = full roster for Board.
 */

export type ShiftRow = {
  id: string
  person_name: string
  phone: string
  started_at: string
  ended_at: string | null
  notes: string
}

let active: ShiftRow[] = []
const history: ShiftRow[] = []
const listeners = new Set<() => void>()

/** Stable snapshot for useSyncExternalStore */
let cachedActive: ShiftRow[] = []
let cachedPrimary: ShiftRow | null = null

function rebuildCache() {
  cachedActive = active.map((s) => ({ ...s }))
  cachedPrimary = cachedActive[0] ?? null
}

function bump() {
  rebuildCache()
  for (const l of listeners) l()
}

rebuildCache()

export function subscribeShift(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Primary on-shift person (newest start) — used for SMS / notify routing. */
export function getOnShift(): ShiftRow | null {
  return cachedPrimary
}

/** Full on-shift roster (stable reference between writes). */
export function listOnShift(): ShiftRow[] {
  return cachedActive
}

export function listShiftHistory(): ShiftRow[] {
  return [...history].reverse()
}

/** Replace active roster from DB (all currently active rows). */
export function hydrateShiftsFromDb(rows: ShiftRow[]): void {
  active = rows
    .map((r) => ({ ...r }))
    .sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    )
  bump()
}

/** @deprecated use hydrateShiftsFromDb — kept for one-row callers */
export function hydrateShiftFromDb(row: ShiftRow): void {
  hydrateShiftsFromDb([row])
}

/**
 * Join the on-shift roster. Same person refreshes their row; others stay.
 */
export function startShift(
  person_name: string,
  phone: string,
  notes = '',
): ShiftRow {
  const name = person_name.trim()
  const existing = active.find(
    (s) => s.person_name.toLowerCase() === name.toLowerCase(),
  )
  if (existing) {
    existing.phone = phone.trim() || existing.phone
    if (notes.trim()) existing.notes = notes.trim()
    // Move to front as primary
    active = [existing, ...active.filter((s) => s.id !== existing.id)]
    bump()
    void import('@/lib/db/persist').then((m) => m.persistShiftStart(existing))
    return { ...existing }
  }

  const row: ShiftRow = {
    id: crypto.randomUUID(),
    person_name: name,
    phone: phone.trim(),
    started_at: new Date().toISOString(),
    ended_at: null,
    notes: notes.trim(),
  }
  active = [row, ...active]
  bump()
  void import('@/lib/db/persist').then((m) => m.persistShiftStart(row))
  return { ...row }
}

/** End one person by shift id, or every active shift when omitted. */
export function endShift(shiftId?: string): void {
  if (shiftId) {
    const idx = active.findIndex((s) => s.id === shiftId)
    if (idx < 0) return
    const row = active[idx]!
    row.ended_at = new Date().toISOString()
    history.push(row)
    active = active.filter((s) => s.id !== shiftId)
    bump()
    void import('@/lib/db/persist').then((m) => m.persistShiftEnd(row.id))
    return
  }
  // Clear all (tests / desk close)
  const ending = [...active]
  const now = new Date().toISOString()
  for (const row of ending) {
    row.ended_at = now
    history.push(row)
    void import('@/lib/db/persist').then((m) => m.persistShiftEnd(row.id))
  }
  active = []
  bump()
}

export function endShiftForPerson(person_name: string): void {
  const name = person_name.trim().toLowerCase()
  const row = active.find((s) => s.person_name.toLowerCase() === name)
  if (row) endShift(row.id)
}

export function updateShiftNotes(notes: string, shiftId?: string): void {
  const row = shiftId
    ? active.find((s) => s.id === shiftId)
    : active[0]
  if (!row) return
  row.notes = notes
  bump()
}
