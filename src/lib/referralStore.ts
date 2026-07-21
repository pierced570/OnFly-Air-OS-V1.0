/**
 * Referral partners directory — session + localStorage.
 * Trip money still lives on financial_records (referral_name / share / paid_out).
 */

import {
  emptyReferralPerson,
  type ReferralPerson,
  type ReferralShareMode,
} from '@/domain/referrals'

const STORAGE_KEY = 'onfly.referrals.v1'

const people = new Map<string, ReferralPerson>()
const listeners = new Set<() => void>()
let snapshot: ReferralPerson[] = []
/** Cached active subset — stable for useSyncExternalStore getSnapshot. */
let activeSnapshot: ReferralPerson[] = []

function rebuild() {
  snapshot = [...people.values()].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  activeSnapshot = snapshot.filter((p) => p.active)
}

function persistLocal() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...people.values()]))
  } catch {
    /* quota */
  }
}

function loadLocal() {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as ReferralPerson[]
    if (!Array.isArray(parsed)) return
    for (const row of parsed) {
      if (!row?.id || !row.name) continue
      people.set(row.id, {
        ...emptyReferralPerson(),
        ...row,
        share_mode: row.share_mode === 'percent_margin' ? 'percent_margin' : 'flat',
        share_value: Number(row.share_value) || 0,
        active: row.active !== false,
      })
    }
  } catch {
    /* ignore */
  }
}

function bump() {
  rebuild()
  persistLocal()
  for (const l of listeners) l()
}

loadLocal()
rebuild()

export function subscribeReferrals(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listReferrals(): ReferralPerson[] {
  return snapshot
}

/** Stable snapshot of active referrers — do not allocate a new array each read. */
export function listActiveReferrals(): ReferralPerson[] {
  return activeSnapshot
}

export function getReferral(id: string): ReferralPerson | undefined {
  return people.get(id)
}

export function getReferralByName(name: string): ReferralPerson | undefined {
  const needle = name.trim().toLowerCase()
  if (!needle) return undefined
  return snapshot.find((p) => p.name.trim().toLowerCase() === needle)
}

export function addReferral(
  input: Partial<Omit<ReferralPerson, 'id' | 'created_at'>> & { name: string },
): ReferralPerson {
  const id = `ref-${crypto.randomUUID().slice(0, 8)}`
  const row: ReferralPerson = {
    id,
    name: input.name.trim(),
    email: (input.email ?? '').trim(),
    cell: (input.cell ?? '').trim(),
    share_mode: (input.share_mode as ReferralShareMode) || 'flat',
    share_value: Number(input.share_value) || 0,
    notes: (input.notes ?? '').trim(),
    active: input.active !== false,
    created_at: new Date().toISOString(),
  }
  people.set(id, row)
  bump()
  return row
}

export function updateReferral(
  id: string,
  patch: Partial<Omit<ReferralPerson, 'id' | 'created_at'>>,
): ReferralPerson | undefined {
  const row = people.get(id)
  if (!row) return undefined
  if (patch.name != null) row.name = patch.name.trim()
  if (patch.email != null) row.email = patch.email.trim()
  if (patch.cell != null) row.cell = patch.cell.trim()
  if (patch.share_mode != null) row.share_mode = patch.share_mode
  if (patch.share_value != null) row.share_value = Number(patch.share_value) || 0
  if (patch.notes != null) row.notes = patch.notes.trim()
  if (patch.active != null) row.active = patch.active
  bump()
  return row
}

export function __resetReferralsForTests(): void {
  people.clear()
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
  rebuild()
  for (const l of listeners) l()
}
