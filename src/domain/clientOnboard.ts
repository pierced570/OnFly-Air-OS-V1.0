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

/** Who issues PO numbers on invoices — every client is different. */
export type PoAssignedBy = 'client' | 'onfly'

export type UpdateChannel = 'email' | 'sms' | 'both'

/** Per-mission-type aircraft policy (freight column vs passenger column). */
export type MissionAircraftPolicy = {
  dual_pilot_only: boolean
  multi_engine_only: boolean
  single_engine_ok: boolean
  single_engine_turboprop_ok: boolean
  /** Soft — dispatch may deviate with explicit client permission. */
  exceptions_with_permission: boolean
}

export function emptyMissionAircraftPolicy(): MissionAircraftPolicy {
  return {
    dual_pilot_only: false,
    multi_engine_only: false,
    single_engine_ok: false,
    single_engine_turboprop_ok: false,
    exceptions_with_permission: false,
  }
}

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
  /** Who assigns PO numbers — client-provided vs OnFly-generated. */
  po_assigned_by: PoAssignedBy | null
  po_prefix: string
  /**
   * Client needs OnFly registered as a vendor / a vendor # in their AP system.
   * null = not answered yet.
   */
  needs_vendor_number: boolean | null
  vendor_number_notes: string
  vendor_packet_to: string

  /**
   * Aircraft policy split: freight trips vs passenger trips.
   * Maps into client_rules (freight → hard filters) + other_rules chips.
   */
  freight_policy: MissionAircraftPolicy
  passenger_policy: MissionAircraftPolicy
  /** No passenger trips — freight column only applies. */
  freight_only: boolean
  hazmat_allowed: boolean
  hazmat_notes: string
  declared_value_norm: string
  /** Free-form notes → other_rules */
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
    po_assigned_by: null,
    po_prefix: '',
    needs_vendor_number: null,
    vendor_number_notes: '',
    vendor_packet_to: '',
    freight_policy: emptyMissionAircraftPolicy(),
    passenger_policy: emptyMissionAircraftPolicy(),
    freight_only: false,
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

function policyChips(
  label: 'Freight' | 'Passenger',
  p: MissionAircraftPolicy,
): string[] {
  const chips: string[] = []
  if (p.dual_pilot_only) chips.push(`${label}: dual pilot only`)
  if (p.multi_engine_only) chips.push(`${label}: multi-engine only`)
  if (p.single_engine_ok) chips.push(`${label}: single-engine OK`)
  if (p.single_engine_turboprop_ok) {
    chips.push(`${label}: single-engine turboprop OK`)
  }
  if (p.exceptions_with_permission) {
    chips.push(`${label}: exceptions with permission`)
  }
  return chips
}

/**
 * Hard filters from a policy column.
 * multi-engine only wins; else SE turboprop-only when turboprop OK but not general SE.
 */
export function hardFiltersFromPolicy(p: MissionAircraftPolicy): {
  dual_pilot_required: boolean
  multi_engine_only: boolean
  single_engine_turboprop_only: boolean
} {
  const multi = p.multi_engine_only
  return {
    dual_pilot_required: p.dual_pilot_only,
    multi_engine_only: multi,
    single_engine_turboprop_only:
      !multi && p.single_engine_turboprop_ok && !p.single_engine_ok,
  }
}

/** Map onboard answers → client_rules (freight column drives hard filters). */
export function rulesFromOnboardDraft(
  draft: ClientOnboardDraft,
): OnboardRulesSlice {
  const other: string[] = []
  if (draft.po_assigned_by === 'client') {
    other.push('PO assigned by client')
  } else if (draft.po_assigned_by === 'onfly') {
    other.push('PO assigned by OnFly')
  }
  if (draft.needs_vendor_number === true) {
    other.push('Needs vendor number in client AP system')
  }
  if (draft.oversized) other.push('Oversized freight')
  other.push(...policyChips('Freight', draft.freight_policy))
  if (!draft.freight_only) {
    other.push(...policyChips('Passenger', draft.passenger_policy))
  }
  const notes = draft.aircraft_other_notes.trim()
  if (notes) other.push(notes)

  const hard = hardFiltersFromPolicy(draft.freight_policy)

  return {
    dual_pilot_required: hard.dual_pilot_required,
    freight_only: draft.freight_only,
    multi_engine_only: hard.multi_engine_only,
    single_engine_turboprop_only: hard.single_engine_turboprop_only,
    no_single_engine_night: false,
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
