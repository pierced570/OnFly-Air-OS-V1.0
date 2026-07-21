/**
 * Who is logged into the dispatcher UI right now.
 * Browser localStorage + optional Supabase sync so the Board can list
 * everyone across devices (when DB is configured).
 */

export type PresenceRow = {
  staff_id: string
  name: string
  phone: string
  last_seen_at: string
}

const STORAGE_KEY = 'onfly.staff.presence.v1'
/** Drop presence if no heartbeat within this window. */
export const PRESENCE_TTL_MS = 3 * 60 * 1000

let rows: PresenceRow[] = loadLocal()
const listeners = new Set<() => void>()
let cached: PresenceRow[] = []

function storageAvailable(): boolean {
  return typeof localStorage !== 'undefined'
}

function loadLocal(): PresenceRow[] {
  if (!storageAvailable()) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PresenceRow[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistLocal() {
  if (!storageAvailable()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch {
    /* ignore */
  }
}

function prune(list: PresenceRow[], now = Date.now()): PresenceRow[] {
  return list.filter(
    (r) => now - new Date(r.last_seen_at).getTime() < PRESENCE_TTL_MS,
  )
}

function rebuildCache() {
  cached = prune(rows).map((r) => ({ ...r }))
}

function bump() {
  rebuildCache()
  for (const l of listeners) l()
}

rebuildCache()

export function subscribePresence(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Stable list of staff still within the presence TTL. */
export function listLoggedIn(): PresenceRow[] {
  return cached
}

export function hydratePresenceFromDb(list: PresenceRow[]): void {
  const byId = new Map<string, PresenceRow>()
  for (const r of [...rows, ...list]) {
    const prev = byId.get(r.staff_id)
    if (
      !prev ||
      new Date(r.last_seen_at).getTime() > new Date(prev.last_seen_at).getTime()
    ) {
      byId.set(r.staff_id, { ...r })
    }
  }
  rows = prune([...byId.values()])
  persistLocal()
  bump()
}

export function touchPresence(input: {
  staff_id: string
  name: string
  phone: string
}): void {
  const now = new Date().toISOString()
  const idx = rows.findIndex((r) => r.staff_id === input.staff_id)
  const next: PresenceRow = {
    staff_id: input.staff_id,
    name: input.name.trim(),
    phone: input.phone.trim(),
    last_seen_at: now,
  }
  if (idx >= 0) rows[idx] = next
  else rows.push(next)
  rows = prune(rows)
  persistLocal()
  bump()
  void import('@/lib/db/persist').then((m) => m.persistStaffPresence(next))
}

export function clearPresence(staff_id: string): void {
  rows = rows.filter((r) => r.staff_id !== staff_id)
  persistLocal()
  bump()
  void import('@/lib/db/persist').then((m) => m.clearStaffPresence(staff_id))
}

/** Drop stale rows (call from Board / shell ticker). */
export function prunePresence(): void {
  const before = rows.length
  rows = prune(rows)
  if (rows.length !== before) {
    persistLocal()
    bump()
  } else {
    // Still refresh cache so TTL filtering stays current for readers
    const prevIds = cached.map((c) => c.staff_id).join()
    rebuildCache()
    const nextIds = cached.map((c) => c.staff_id).join()
    if (prevIds !== nextIds) {
      for (const l of listeners) l()
    }
  }
}
