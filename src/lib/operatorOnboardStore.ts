/**
 * Public operator onboarding submissions (session until DB persist).
 * No "amount insured" — that lives on the uploaded COI.
 */

export type OnboardSubmission = {
  id: string
  created_at: string
  company_name: string
  base_icao: string
  company_phone: string
  after_hours_phone: string
  email: string
  callout_min: number | null
  primary_contact: { name: string; email: string; phone: string }
  billing_contact: { name: string; email: string; phone: string }
  capabilities: {
    pax: boolean
    cargo: boolean
    hazmat: boolean
    medivac: boolean
    ops_24hr: boolean
    same_day: boolean
  }
  argus: string
  wyvern: string
  street: string
  city: string
  state: string
  zip: string
  bank_routing: string
  bank_account: string
  notes: string
  /** File names only until Storage wired on this path */
  docs: {
    d085: string | null
    coi: string | null
    charter_cert: string | null
  }
  status: 'pending_review' | 'accepted'
}

const rows = new Map<string, OnboardSubmission>()
const listeners = new Set<() => void>()
let snapshot: OnboardSubmission[] = []

function rebuild() {
  snapshot = [...rows.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )
}

function bump() {
  rebuild()
  for (const l of listeners) l()
}

export function subscribeOnboardSubmissions(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listOnboardSubmissions(): OnboardSubmission[] {
  return snapshot
}

export function submitOperatorOnboard(
  input: Omit<OnboardSubmission, 'id' | 'created_at' | 'status'>,
): OnboardSubmission {
  const row: OnboardSubmission = {
    ...input,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    status: 'pending_review',
  }
  rows.set(row.id, row)
  bump()
  return row
}
