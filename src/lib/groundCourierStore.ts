/**
 * Ground courier / hotshot directory — local until a DB table lands.
 * Flag-don't-exclude: incomplete rows stay listed with notes.
 */

export type GroundCourier = {
  id: string
  name: string
  phone: string
  email: string
  /** Free-text service area (cities, ICAOs, regions). */
  service_areas: string
  notes: string
  active: boolean
  created_at: string
  updated_at: string
}

const KEY = 'onfly.groundCouriers.v1'
const listeners = new Set<() => void>()
let rows: GroundCourier[] = load()
let snapshot: GroundCourier[] = [...rows]

function load(): GroundCourier[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as GroundCourier[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persist() {
  snapshot = [...rows].sort((a, b) => a.name.localeCompare(b.name))
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, JSON.stringify(rows))
    }
  } catch {
    /* ignore */
  }
  for (const l of listeners) l()
}

export function subscribeGroundCouriers(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listGroundCouriers(): GroundCourier[] {
  return snapshot
}

export function upsertGroundCourier(
  input: Partial<GroundCourier> & { name: string },
): GroundCourier {
  const now = new Date().toISOString()
  const name = input.name.trim()
  if (!name) throw new Error('Courier name required')
  const existing = input.id ? rows.find((r) => r.id === input.id) : undefined
  if (existing) {
    existing.name = name
    existing.phone = (input.phone ?? existing.phone).trim()
    existing.email = (input.email ?? existing.email).trim()
    existing.service_areas = (
      input.service_areas ?? existing.service_areas
    ).trim()
    existing.notes = (input.notes ?? existing.notes).trim()
    existing.active = input.active ?? existing.active
    existing.updated_at = now
    persist()
    return existing
  }
  const row: GroundCourier = {
    id: crypto.randomUUID(),
    name,
    phone: (input.phone ?? '').trim(),
    email: (input.email ?? '').trim(),
    service_areas: (input.service_areas ?? '').trim(),
    notes: (input.notes ?? '').trim(),
    active: input.active ?? true,
    created_at: now,
    updated_at: now,
  }
  rows = [row, ...rows]
  persist()
  return row
}

export function removeGroundCourier(id: string): void {
  rows = rows.filter((r) => r.id !== id)
  persist()
}

export function __resetGroundCouriersForTests(): void {
  rows = []
  persist()
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
