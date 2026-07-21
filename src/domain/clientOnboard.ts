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

/**
 * Opt-out aircraft restrictions (everything allowed unless checked).
 * Maps into client_rules hard filters when exceptions_ok is false.
 */
export type MissionAircraftPolicy = {
  /** No single-engine aircraft → multi_engine_only */
  no_single_engine: boolean
  /** No single-engine pistons; SE turboprops OK → single_engine_turboprop_only */
  no_single_engine_pistons: boolean
  dual_pilot_required: boolean
  other_restriction: boolean
  other_notes: string
}

export function emptyMissionAircraftPolicy(): MissionAircraftPolicy {
  return {
    no_single_engine: false,
    no_single_engine_pistons: false,
    dual_pilot_required: false,
    other_restriction: false,
    other_notes: '',
  }
}

/**
 * Normalize stored / legacy policy shapes into the restriction model.
 * Legacy used opt-in flags (single_engine_ok, multi_engine_only, …).
 */
export function normalizeMissionPolicy(
  raw: Partial<MissionAircraftPolicy> & {
    dual_pilot_only?: boolean
    multi_engine_only?: boolean
    single_engine_ok?: boolean
    single_engine_turboprop_ok?: boolean
    exceptions_with_permission?: boolean
  } | null | undefined,
): MissionAircraftPolicy {
  const empty = emptyMissionAircraftPolicy()
  if (!raw) return empty
  if (
    'no_single_engine' in raw ||
    'no_single_engine_pistons' in raw ||
    'dual_pilot_required' in raw ||
    'other_restriction' in raw
  ) {
    return {
      no_single_engine: Boolean(raw.no_single_engine),
      no_single_engine_pistons: Boolean(raw.no_single_engine_pistons),
      dual_pilot_required: Boolean(raw.dual_pilot_required),
      other_restriction: Boolean(raw.other_restriction),
      other_notes: String(raw.other_notes ?? '').trim(),
    }
  }
  // Legacy opt-in → restriction opt-out
  const multi = Boolean(raw.multi_engine_only)
  const seOk = Boolean(raw.single_engine_ok)
  const seTurboOk = Boolean(raw.single_engine_turboprop_ok)
  return {
    no_single_engine: multi,
    no_single_engine_pistons: !multi && seTurboOk && !seOk,
    dual_pilot_required: Boolean(raw.dual_pilot_only ?? raw.dual_pilot_required),
    other_restriction: false,
    other_notes: '',
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
   * Aircraft restrictions — freight always; passenger only when moves_passengers.
   * Nothing checked = no routing constraints.
   */
  freight_policy: MissionAircraftPolicy
  passenger_policy: MissionAircraftPolicy
  /** Do you ever move passengers with us? No → freight_only. */
  moves_passengers: boolean
  /**
   * Soft blocks: dispatch may override restrictions with documented client sign-off.
   * Unchecked = hard filters in candidate generation.
   */
  exceptions_ok: boolean
  declared_value_norm: string

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
    moves_passengers: false,
    exceptions_ok: false,
    declared_value_norm: '',
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
  /** Always true from onboard — hazmat is asked per shipment. */
  hazmat_allowed: boolean
  hazmat_notes: string
  declared_value_norm: string
  /** Soft-block mode for checked restrictions. */
  exceptions_with_permission: boolean
  other_rules: string[]
}

function policyChips(
  label: 'Freight' | 'Passenger',
  p: MissionAircraftPolicy,
): string[] {
  const chips: string[] = []
  if (p.no_single_engine) chips.push(`${label}: no single-engine`)
  if (p.no_single_engine_pistons) {
    chips.push(`${label}: no single-engine pistons (SE turboprop OK)`)
  }
  if (p.dual_pilot_required) chips.push(`${label}: dual pilot required`)
  if (p.other_restriction && p.other_notes.trim()) {
    chips.push(`${label}: ${p.other_notes.trim()}`)
  }
  return chips
}

/**
 * Hard filters from a restriction column.
 * "No single-engine" wins over "no SE pistons".
 */
export function hardFiltersFromPolicy(p: MissionAircraftPolicy): {
  dual_pilot_required: boolean
  multi_engine_only: boolean
  single_engine_turboprop_only: boolean
} {
  const policy = normalizeMissionPolicy(p)
  const multi = policy.no_single_engine
  return {
    dual_pilot_required: policy.dual_pilot_required,
    multi_engine_only: multi,
    single_engine_turboprop_only: !multi && policy.no_single_engine_pistons,
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
  if (draft.moves_passengers) {
    other.push(...policyChips('Passenger', draft.passenger_policy))
  }
  if (draft.exceptions_ok) {
    other.push('Exceptions OK with confirmation')
  }

  const hard = hardFiltersFromPolicy(draft.freight_policy)

  return {
    dual_pilot_required: hard.dual_pilot_required,
    freight_only: !draft.moves_passengers,
    multi_engine_only: hard.multi_engine_only,
    single_engine_turboprop_only: hard.single_engine_turboprop_only,
    no_single_engine_night: false,
    hazmat_allowed: true,
    hazmat_notes: '',
    declared_value_norm: draft.declared_value_norm.trim(),
    exceptions_with_permission: draft.exceptions_ok,
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
