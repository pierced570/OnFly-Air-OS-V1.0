/**
 * OFA Financials derived-money rules.
 * Legacy rows trust historical values; live rows recompute from amounts + flags.
 * One PO / mission can carry multiple vendor lines (aircraft + ground + …).
 */

export type FundedBy = 'Jonny 1%' | 'Jonny' | 'OFA' | 'Awaiting $' | string

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export type TaxBreakdownLine = {
  code: string
  amount: number
  note?: string
}

/** Vendor on a shared PO — aircraft, ground courier, FBO, etc. */
export type VendorLineKind = 'aircraft' | 'ground' | 'fbo' | 'other'

export type FinancialVendorLine = {
  id: string
  kind: VendorLineKind
  vendor_name: string
  tail_number: string | null
  aircraft_type: string | null
  amount: number
  pay_terms: string | null
  vendor_paid: boolean
  bill_logged_in_qb: boolean
  vendor_bill_url: string | null
  vendor_bill_verified: boolean
  notes: string | null
}

export type FinancialRecord = {
  id: string
  is_legacy: boolean
  source: string
  date_of_flight: string | null
  operator_po: string | null
  client_name: string | null
  route_text: string | null
  aircraft_type: string | null
  tail_number: string | null
  /** Rolled summary of vendor_lines (primary / joined names). */
  vendor_name: string | null
  pay_terms: string | null
  referral_name: string | null

  client_subtotal_pre_tax: number | null
  tax_total: number
  tax_breakdown: TaxBreakdownLine[]
  client_invoiced_amount: number
  /** Sum of vendor_lines amounts (or legacy single amount). */
  vendor_amount: number
  margin: number
  /** $ owed to referral partner for this trip (profit share). */
  referral_share_amount: number

  funded_by: FundedBy | null
  deposited_to: string | null
  check_deposit_number: string | null
  jonnys_profits: number
  jonny_invested: number
  jonny_money_owed: number
  jonny_money_returned: number
  ofa_profit_per_trip: number

  was_it_paid: boolean
  /** True when every vendor line is paid (or legacy single flag). */
  vendor_paid: boolean
  investor_paid: boolean
  has_ofa_seen_profit: boolean
  /** True when every vendor line is logged in QB. */
  bill_logged_in_qb: boolean
  referral_paid_out: boolean

  vendor_bill_url: string | null
  vendor_bill_verified: boolean
  notes: string | null

  /**
   * Per-vendor costs under the same PO. Empty → treat as one legacy vendor
   * from vendor_name / vendor_amount.
   */
  vendor_lines: FinancialVendorLine[]

  /** Set after QBO create_invoice (or mock) */
  qb_invoice_id?: string | null
  qb_invoice_number?: string | null
  invoice_date?: string | null
  due_date?: string | null
  po_number?: string | null
}

export function newVendorLine(
  partial?: Partial<FinancialVendorLine>,
): FinancialVendorLine {
  return {
    id: crypto.randomUUID(),
    kind: 'aircraft',
    vendor_name: '',
    tail_number: null,
    aircraft_type: null,
    amount: 0,
    pay_terms: 'Net 30',
    vendor_paid: false,
    bill_logged_in_qb: false,
    vendor_bill_url: null,
    vendor_bill_verified: false,
    notes: null,
    ...partial,
  }
}

/** When lines are empty, synthesize one from the rolled vendor_* fields. */
export function ensureVendorLines(r: FinancialRecord): FinancialVendorLine[] {
  if (Array.isArray(r.vendor_lines) && r.vendor_lines.length > 0) {
    return r.vendor_lines
  }
  if (
    !r.vendor_name &&
    !(r.vendor_amount > 0) &&
    !r.tail_number &&
    !r.aircraft_type
  ) {
    return []
  }
  return [
    newVendorLine({
      id: `${r.id}-primary`,
      kind: 'aircraft',
      vendor_name: r.vendor_name ?? '',
      tail_number: r.tail_number,
      aircraft_type: r.aircraft_type,
      amount: r.vendor_amount || 0,
      pay_terms: r.pay_terms,
      vendor_paid: r.vendor_paid,
      bill_logged_in_qb: r.bill_logged_in_qb,
      vendor_bill_url: r.vendor_bill_url,
      vendor_bill_verified: r.vendor_bill_verified,
    }),
  ]
}

export function sumVendorLineAmounts(lines: FinancialVendorLine[]): number {
  return round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0))
}

export function formatVendorSummary(lines: FinancialVendorLine[]): string {
  const names = lines
    .map((l) => l.vendor_name.trim())
    .filter(Boolean)
  if (!names.length) return '—'
  if (names.length === 1) return names[0]!
  if (names.length === 2) return `${names[0]} + ${names[1]}`
  return `${names[0]} + ${names[1]} (+${names.length - 2})`
}

export function vendorKindLabel(kind: VendorLineKind): string {
  switch (kind) {
    case 'aircraft':
      return 'Aircraft'
    case 'ground':
      return 'Ground'
    case 'fbo':
      return 'FBO'
    default:
      return 'Other'
  }
}

/** Roll line totals / flags onto the parent financial row. */
export function applyVendorLineRollup(r: FinancialRecord): FinancialRecord {
  const lines = ensureVendorLines(r)
  if (!lines.length) {
    return { ...r, vendor_lines: [] }
  }
  const vendor_amount = sumVendorLineAmounts(lines)
  const vendor_paid = lines.every((l) => l.vendor_paid)
  const bill_logged_in_qb = lines.every((l) => l.bill_logged_in_qb)
  const primary =
    lines.find((l) => l.kind === 'aircraft') ?? lines[0]!
  return {
    ...r,
    vendor_lines: lines,
    vendor_amount,
    vendor_paid,
    bill_logged_in_qb,
    vendor_name: formatVendorSummary(lines),
    vendor_bill_url:
      lines.find((l) => l.vendor_bill_url)?.vendor_bill_url ?? null,
    vendor_bill_verified: lines.every(
      (l) => !l.amount || l.vendor_bill_verified || Boolean(l.vendor_bill_url),
    ),
    tail_number: primary.tail_number ?? r.tail_number,
    aircraft_type: primary.aircraft_type ?? r.aircraft_type,
    pay_terms: primary.pay_terms ?? r.pay_terms,
  }
}

export type ComputedFinancial = FinancialRecord & {
  /** True when every vendor bill is uploaded, paid, and logged in QB */
  operator_side_complete: boolean
  /** True when client paid and investor/referral settled as needed */
  client_side_complete: boolean
  fully_closed: boolean
  /** Vendor lines for UI (always populated for display). */
  vendors: FinancialVendorLine[]
}

/** Deterministic investor / margin derivation for non-legacy rows. */
export function computeFields(record: FinancialRecord): ComputedFinancial {
  const rolled = applyVendorLineRollup({
    ...record,
    vendor_lines: Array.isArray(record.vendor_lines)
      ? record.vendor_lines
      : [],
  })

  if (rolled.is_legacy) {
    // Trust historical money columns; still derive OFA profit for KPIs.
    const margin = rolled.margin || 0
    const jp = rolled.jonnys_profits || 0
    const funded = (rolled.funded_by ?? '').trim()
    const ofa_profit_per_trip =
      funded === 'OFA' || funded === 'Awaiting $'
        ? margin
        : round2(margin - jp)
    return withCompleteness({ ...rolled, ofa_profit_per_trip })
  }

  const client = rolled.client_invoiced_amount || 0
  const vendor = rolled.vendor_amount || 0
  const margin = round2(client - vendor)
  const funded = (rolled.funded_by ?? 'Jonny 1%').trim() || 'Jonny 1%'

  let jonnys_profits = 0
  let jonny_invested = 0
  let jonny_money_owed = 0

  if (funded === 'Jonny 1%') {
    jonnys_profits = round2(vendor * 0.01)
    jonny_invested = round2(vendor)
    jonny_money_owed = round2(vendor * 1.01)
  } else if (funded === 'Jonny') {
    jonnys_profits = round2(vendor * 0.01)
    jonny_invested = round2(vendor)
    jonny_money_owed = round2(vendor)
  }

  let jonny_money_returned = rolled.jonny_money_returned || 0
  if (rolled.investor_paid) {
    jonny_money_returned = jonny_money_owed
    jonny_money_owed = 0
  } else {
    jonny_money_returned = 0
  }

  // OFA profit: margin after investor cut when Jonny-funded; full margin when OFA-funded
  const ofa_profit_per_trip =
    funded === 'OFA' || funded === 'Awaiting $'
      ? margin
      : round2(margin - jonnys_profits)

  return withCompleteness({
    ...rolled,
    funded_by: funded,
    margin,
    jonnys_profits,
    jonny_invested,
    jonny_money_owed,
    jonny_money_returned,
    ofa_profit_per_trip,
  })
}

function lineComplete(l: FinancialVendorLine): boolean {
  if (!(l.amount > 0) && !l.vendor_name.trim()) return true
  return Boolean(l.vendor_bill_url && l.vendor_paid && l.bill_logged_in_qb)
}

function withCompleteness(r: FinancialRecord): ComputedFinancial {
  const vendors = ensureVendorLines(r)
  const operator_side_complete =
    vendors.length > 0
      ? vendors.every(lineComplete)
      : Boolean(r.vendor_bill_url && r.vendor_paid && r.bill_logged_in_qb)
  const investorOk = r.investor_paid || r.jonny_money_owed <= 0
  const referralOk =
    r.referral_paid_out || !r.referral_name || (r.referral_share_amount || 0) <= 0
  const client_side_complete = Boolean(r.was_it_paid && investorOk && referralOk)
  return {
    ...r,
    vendors,
    operator_side_complete,
    client_side_complete,
    fully_closed: operator_side_complete && client_side_complete,
  }
}

/** Parse "Net 30" → 30 days; default 30. */
export function payTermsDays(payTerms: string | null | undefined): number {
  if (!payTerms) return 30
  const m = payTerms.match(/(\d+)/)
  return m ? Number(m[1]) : 30
}

export function dueDateFor(r: Pick<FinancialRecord, 'date_of_flight' | 'pay_terms'>): Date | null {
  if (!r.date_of_flight) return null
  const d = new Date(`${r.date_of_flight}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + payTermsDays(r.pay_terms))
  return d
}

export function summarize(records: ComputedFinancial[]) {
  const revenue = round2(records.reduce((s, r) => s + (r.client_invoiced_amount || 0), 0))
  const cost = round2(records.reduce((s, r) => s + (r.vendor_amount || 0), 0))
  const margin = round2(records.reduce((s, r) => s + (r.margin || 0), 0))
  const ofa = round2(records.reduce((s, r) => s + (r.ofa_profit_per_trip || 0), 0))
  const jonnyInvested = round2(records.reduce((s, r) => s + (r.jonny_invested || 0), 0))
  const jonnyReturned = round2(records.reduce((s, r) => s + (r.jonny_money_returned || 0), 0))
  const unpaid = records.filter(
    (r) => !r.was_it_paid || !r.vendor_paid || r.jonny_money_owed > 0,
  ).length
  return {
    trips: records.length,
    revenue,
    cost,
    margin,
    ofa,
    jonnyInvested,
    jonnyReturned,
    unpaid,
  }
}
