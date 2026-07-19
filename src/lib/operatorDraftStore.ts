/**
 * Operators created via Admin wizard (session). Network page still reads
 * fixtures/Supabase; this list is for wizard-created drafts until sync.
 */

export type OperatorDraft = {
  id: string
  name: string
  dba: string
  certificate: string
  base_icao: string
  region: string
  contacts: Array<{
    name: string
    role: string
    cell: string
    email: string
    consent_sms: boolean
    consent_call: boolean
  }>
  capabilities: {
    cargo: boolean
    pax: boolean
    hazmat: boolean
    medivac: boolean
    ops_24hr: boolean
    callout_min: number
  }
  crew: {
    single_pilot_ok: boolean
    dual_available: boolean
    night_policy: string
  }
  aircraft: Array<{
    tail: string
    type_name: string
    liability_limit: string
    hull_value: string
    insurance_expiry: string
  }>
  rates_note: string
  completeness: number
  created_at: string
}

const rows = new Map<string, OperatorDraft>()
const listeners = new Set<() => void>()
let snapshot: OperatorDraft[] = []

function rebuild() {
  snapshot = [...rows.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )
}

function bump() {
  rebuild()
  for (const l of listeners) l()
}

export function subscribeOperatorDrafts(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listOperatorDrafts(): OperatorDraft[] {
  return snapshot
}

export function saveOperatorDraft(
  draft: Omit<OperatorDraft, 'id' | 'created_at'>,
): OperatorDraft {
  const row: OperatorDraft = {
    ...draft,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  }
  rows.set(row.id, row)
  bump()
  return row
}

/** @deprecated use parseD085File — kept for tests / offline fixture */
export { fixtureD085Rows as mockParseD085 } from '@/domain/d085Parse'
