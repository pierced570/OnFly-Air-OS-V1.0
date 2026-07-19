/**
 * Customer (client) onboarding — pure validation + mapping.
 * No React / Supabase.
 */

export type ClientLane = {
  origin: string
  destination: string
  /** Optional free-text city hint for autofill */
  origin_city?: string
  destination_city?: string
}

export type ClientAddress = {
  street: string
  city: string
  state: string
  zip: string
}

export type ClientOnboardPerson = {
  name: string
  email: string
  phone: string
}

export type PayTermsRequest = 'prepay' | 'net_15' | 'net_30' | 'other'

export type UpdateChannel = 'email' | 'sms' | 'both'

export type ClientOnboardDraft = {
  // Company
  legal_name: string
  dba: string
  website: string
  address: ClientAddress
  billing_same_as_address: boolean

  // People
  ops: ClientOnboardPerson
  ap: ClientOnboardPerson
  ap_same_as_ops: boolean
  supervisors: ClientOnboardPerson[]
  front_desk_phone: string
  emergency: ClientOnboardPerson
  emergency_same_as_ops: boolean

  // Billing
  pay_terms: PayTermsRequest
  requires_po: boolean
  card_on_file: boolean | null
  vendor_packet_to: string

  // Shipping profile
  no_frequent_lanes: boolean
  lanes: ClientLane[]
  hazmat_sometimes: boolean
  temp_control: boolean
  oversized: boolean
  high_declared_value: boolean

  // Preferences
  update_channel: UpdateChannel
  anything_else: string
}

export type ClientOnboardIssues = { field: string; message: string }

export function emptyClientOnboardDraft(): ClientOnboardDraft {
  return {
    legal_name: '',
    dba: '',
    website: '',
    address: { street: '', city: '', state: '', zip: '' },
    billing_same_as_address: true,
    ops: { name: '', email: '', phone: '' },
    ap: { name: '', email: '', phone: '' },
    ap_same_as_ops: false,
    supervisors: [{ name: '', email: '', phone: '' }],
    front_desk_phone: '',
    emergency: { name: '', email: '', phone: '' },
    emergency_same_as_ops: false,
    pay_terms: 'net_30',
    requires_po: false,
    card_on_file: null,
    vendor_packet_to: '',
    no_frequent_lanes: false,
    lanes: [{ origin: '', destination: '' }],
    hazmat_sometimes: false,
    temp_control: false,
    oversized: false,
    high_declared_value: false,
    update_channel: 'email',
    anything_else: '',
  }
}

function emailOk(e: string): boolean {
  return e.trim().includes('@')
}

function personFilled(p: ClientOnboardPerson): boolean {
  return Boolean(p.name.trim() || p.email.trim() || p.phone.trim())
}

/** ~9 required fields — company, address, ops, AP, front desk, emergency. */
export function validateClientOnboard(
  draft: ClientOnboardDraft,
): ClientOnboardIssues[] {
  const issues: ClientOnboardIssues[] = []
  if (!draft.legal_name.trim()) {
    issues.push({ field: 'legal_name', message: 'Company legal name is required' })
  }
  const a = draft.address
  if (!a.street.trim() || !a.city.trim() || !a.state.trim() || !a.zip.trim()) {
    issues.push({
      field: 'address',
      message: 'Full company address is required (street, city, state, ZIP)',
    })
  }
  if (!draft.ops.name.trim() || !emailOk(draft.ops.email)) {
    issues.push({
      field: 'ops',
      message: 'Ops contact name and email are required (tracking updates)',
    })
  }
  const ap = draft.ap_same_as_ops ? draft.ops : draft.ap
  if (!emailOk(ap.email)) {
    issues.push({
      field: 'ap',
      message: 'Accounts Payable email is required (invoices)',
    })
  }
  if (!draft.front_desk_phone.trim()) {
    issues.push({
      field: 'front_desk_phone',
      message: 'Ops front desk phone is required',
    })
  }
  const em = draft.emergency_same_as_ops ? draft.ops : draft.emergency
  if (!em.name.trim() || !em.phone.trim()) {
    issues.push({
      field: 'emergency',
      message: 'Emergency / head supervisor name and phone are required',
    })
  }
  if (!draft.no_frequent_lanes) {
    const good = draft.lanes.some(
      (l) => l.origin.trim().length >= 3 && l.destination.trim().length >= 3,
    )
    if (!good) {
      issues.push({
        field: 'lanes',
        message:
          'Add at least one frequent route, or check “No frequent locations”',
      })
    }
  }
  return issues
}

export function payTermsLabel(t: PayTermsRequest): string {
  if (t === 'prepay') return 'Prepay / CC'
  if (t === 'net_15') return 'Net 15'
  if (t === 'net_30') return 'Net 30'
  return 'Other'
}

/** City/place hints from frequent lanes for request autofill. */
export function laneCityHints(lanes: ClientLane[]): string[] {
  const out = new Set<string>()
  for (const l of lanes) {
    for (const raw of [
      l.origin_city,
      l.destination_city,
      l.origin,
      l.destination,
    ]) {
      const s = (raw ?? '').trim()
      if (s.length >= 2) out.add(s)
    }
  }
  return [...out]
}

export function resolvePeople(draft: ClientOnboardDraft): {
  ops: ClientOnboardPerson
  ap: ClientOnboardPerson
  emergency: ClientOnboardPerson
  supervisors: ClientOnboardPerson[]
} {
  const ops = {
    name: draft.ops.name.trim(),
    email: draft.ops.email.trim().toLowerCase(),
    phone: draft.ops.phone.trim(),
  }
  const ap = draft.ap_same_as_ops
    ? { ...ops }
    : {
        name: draft.ap.name.trim() || ops.name,
        email: draft.ap.email.trim().toLowerCase(),
        phone: draft.ap.phone.trim() || ops.phone,
      }
  const emergency = draft.emergency_same_as_ops
    ? { ...ops }
    : {
        name: draft.emergency.name.trim(),
        email: draft.emergency.email.trim().toLowerCase(),
        phone: draft.emergency.phone.trim(),
      }
  const supervisors = draft.supervisors
    .filter(personFilled)
    .map((s) => ({
      name: s.name.trim(),
      email: s.email.trim().toLowerCase(),
      phone: s.phone.trim(),
    }))
    .filter((s) => emailOk(s.email) || s.phone)
  return { ops, ap, emergency, supervisors }
}
