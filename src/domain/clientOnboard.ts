/**
 * Customer (client) onboarding — pure validation + mapping.
 * Subjects align with Admin "Add client" rules interview + Clients directory fields.
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

export type PayTermsRequest = 'prepay' | 'net_15' | 'net_30' | 'net_60' | 'other'

export type UpdateChannel = 'email' | 'sms' | 'both'

/**
 * Public `/client` draft — same subjects dispatchers enter on Admin + Clients:
 * company, people (ops/AP/supply/emergency), billing, routing rules, lanes, prefs.
 */
export type ClientOnboardDraft = {
  // Company
  legal_name: string
  dba: string
  website: string
  address: ClientAddress
  billing_same_as_address: boolean
  billing_address: ClientAddress

  // People
  ops: ClientOnboardPerson
  ap: ClientOnboardPerson
  ap_same_as_ops: boolean
  supervisors: ClientOnboardPerson[]
  front_desk_phone: string
  emergency: ClientOnboardPerson
  emergency_same_as_ops: boolean

  // Billing (Clients: pay_terms, invoice_email, po_prefix)
  pay_terms: PayTermsRequest
  requires_po: boolean
  po_prefix: string
  card_on_file: boolean | null
  vendor_packet_to: string

  // Routing rules (Admin ClientWizard / client_rules)
  dual_pilot_required: boolean
  freight_only: boolean
  multi_engine_only: boolean
  /** Single-engine OK only when turboprop (hard filter). */
  single_engine_turboprop_only: boolean
  no_single_engine_night: boolean
  /** Soft prefs → other_rules chips */
  single_engine_piston_ok: boolean
  turboprop_preferred: boolean
  jet_ok: boolean
  cargo_door_required: boolean
  pressurized_preferred: boolean
  hazmat_allowed: boolean
  hazmat_notes: string
  declared_value_norm: string
  /** Free-form aircraft / cargo notes → other_rules */
  aircraft_other_notes: string

  // Shipping profile
  no_frequent_lanes: boolean
  lanes: ClientLane[]
  oversized: boolean

  // Preferences
  update_channel: UpdateChannel
  anything_else: string
}

export type ClientOnboardIssues = { field: string; message: string }

export function emptyAddress(): ClientAddress {
  return { street: '', city: '', state: '', zip: '' }
}

export function emptyClientOnboardDraft(): ClientOnboardDraft {
  return {
    legal_name: '',
    dba: '',
    website: '',
    address: emptyAddress(),
    billing_same_as_address: true,
    billing_address: emptyAddress(),
    ops: { name: '', email: '', phone: '' },
    ap: { name: '', email: '', phone: '' },
    ap_same_as_ops: false,
    supervisors: [{ name: '', email: '', phone: '' }],
    front_desk_phone: '',
    emergency: { name: '', email: '', phone: '' },
    emergency_same_as_ops: false,
    pay_terms: 'net_30',
    requires_po: false,
    po_prefix: '',
    card_on_file: null,
    vendor_packet_to: '',
    dual_pilot_required: false,
    freight_only: false,
    multi_engine_only: false,
    single_engine_turboprop_only: false,
    no_single_engine_night: false,
    single_engine_piston_ok: false,
    turboprop_preferred: false,
    jet_ok: false,
    cargo_door_required: false,
    pressurized_preferred: false,
    hazmat_allowed: true,
    hazmat_notes: '',
    declared_value_norm: '',
    aircraft_other_notes: '',
    no_frequent_lanes: false,
    lanes: [{ origin: '', destination: '' }],
    oversized: false,
    update_channel: 'email',
    anything_else: '',
  }
}

function emailOk(e: string): boolean {
  return e.trim().includes('@')
}

function addressComplete(a: ClientAddress): boolean {
  return Boolean(
    a.street.trim() && a.city.trim() && a.state.trim() && a.zip.trim(),
  )
}

function personFilled(p: ClientOnboardPerson): boolean {
  return Boolean(p.name.trim() || p.email.trim() || p.phone.trim())
}

/** Required: company, address, ops, AP, front desk, emergency; lanes unless opted out. */
export function validateClientOnboard(
  draft: ClientOnboardDraft,
): ClientOnboardIssues[] {
  const issues: ClientOnboardIssues[] = []
  if (!draft.legal_name.trim()) {
    issues.push({ field: 'legal_name', message: 'Company legal name is required' })
  }
  if (!addressComplete(draft.address)) {
    issues.push({
      field: 'address',
      message: 'Full company address is required (street, city, state, ZIP)',
    })
  }
  if (
    !draft.billing_same_as_address &&
    !addressComplete(draft.billing_address)
  ) {
    issues.push({
      field: 'billing_address',
      message: 'Billing address is required when different from company',
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
  if (draft.requires_po && !draft.po_prefix.trim()) {
    // Soft: not blocking — dispatcher can set later; no hard fail
  }
  return issues
}

export function payTermsLabel(t: PayTermsRequest): string {
  if (t === 'prepay') return 'Prepay / CC'
  if (t === 'net_15') return 'Net 15'
  if (t === 'net_30') return 'Net 30'
  if (t === 'net_60') return 'Net 60'
  return 'Other'
}

/** Routing-rules slice written to client_rules (Admin wizard same fields). */
export type OnboardRulesSlice = {
  dual_pilot_required: boolean
  freight_only: boolean
  multi_engine_only: boolean
  single_engine_turboprop_only: boolean
  no_single_engine_night: boolean
  hazmat_allowed: boolean
  hazmat_notes: string
  declared_value_norm: string
  other_rules: string[]
}

/** Map onboard answers → client_rules (same shape Admin wizard writes). */
export function rulesFromOnboardDraft(
  draft: ClientOnboardDraft,
): OnboardRulesSlice {
  const other: string[] = []
  if (draft.requires_po) other.push('PO required on invoices')
  if (draft.card_on_file === true) {
    other.push('Card on file requested (send secure link)')
  }
  if (draft.card_on_file === false) other.push('No card on file')
  if (draft.oversized) other.push('Oversized freight')
  if (draft.single_engine_piston_ok) other.push('Single-engine piston OK')
  if (draft.turboprop_preferred) other.push('Turboprop preferred')
  if (draft.jet_ok) other.push('Jet OK')
  if (draft.cargo_door_required) other.push('Cargo door required')
  if (draft.pressurized_preferred) other.push('Pressurized preferred')
  const notes = draft.aircraft_other_notes.trim()
  if (notes) other.push(notes)

  return {
    dual_pilot_required: draft.dual_pilot_required,
    freight_only: draft.freight_only,
    multi_engine_only: draft.multi_engine_only,
    single_engine_turboprop_only: draft.single_engine_turboprop_only,
    no_single_engine_night: draft.no_single_engine_night,
    hazmat_allowed: draft.hazmat_allowed,
    hazmat_notes: draft.hazmat_notes.trim(),
    declared_value_norm: draft.declared_value_norm.trim(),
    other_rules: other,
  }
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
