/**
 * OFA Financials derived-money rules.
 * Legacy rows trust historical values; live rows recompute from amounts + flags.
 */

export type FundedBy = 'Jonny 1%' | 'Jonny' | 'OFA' | 'Awaiting $' | string

export type TaxBreakdownLine = {
  code: string
  amount: number
  note?: string
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
  vendor_name: string | null
  pay_terms: string | null
  referral_name: string | null

  client_subtotal_pre_tax: number | null
  tax_total: number
  tax_breakdown: TaxBreakdownLine[]
  client_invoiced_amount: number
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
  vendor_paid: boolean
  investor_paid: boolean
  has_ofa_seen_profit: boolean
  bill_logged_in_qb: boolean
  referral_paid_out: boolean

  vendor_bill_url: string | null
  vendor_bill_verified: boolean
  notes: string | null

  /** Set after QBO create_invoice (or mock) */
  qb_invoice_id?: string | null
  qb_invoice_number?: string | null
  invoice_date?: string | null
  due_date?: string | null
  po_number?: string | null
}

export type ComputedFinancial = FinancialRecord & {
  /** True when operator bill uploaded, vendor paid, and logged in QB */
  operator_side_complete: boolean
  /** True when client paid and investor/referral settled as needed */
  client_side_complete: boolean
  fully_closed: boolean
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Deterministic investor / margin derivation for non-legacy rows. */
export function computeFields(record: FinancialRecord): ComputedFinancial {
  if (record.is_legacy) {
    // Trust historical money columns; still derive OFA profit for KPIs.
    const margin = record.margin || 0
    const jp = record.jonnys_profits || 0
    const funded = (record.funded_by ?? '').trim()
    const ofa_profit_per_trip =
      funded === 'OFA' || funded === 'Awaiting $'
        ? margin
        : round2(margin - jp)
    return withCompleteness({ ...record, ofa_profit_per_trip })
  }

  const client = record.client_invoiced_amount || 0
  const vendor = record.vendor_amount || 0
  const margin = round2(client - vendor)
  const funded = (record.funded_by ?? 'Jonny 1%').trim() || 'Jonny 1%'

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

  let jonny_money_returned = record.jonny_money_returned || 0
  if (record.investor_paid) {
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
    ...record,
    funded_by: funded,
    margin,
    jonnys_profits,
    jonny_invested,
    jonny_money_owed,
    jonny_money_returned,
    ofa_profit_per_trip,
  })
}

function withCompleteness(r: FinancialRecord): ComputedFinancial {
  const operator_side_complete = Boolean(
    r.vendor_bill_url && r.vendor_paid && r.bill_logged_in_qb,
  )
  const investorOk = r.investor_paid || r.jonny_money_owed <= 0
  const referralOk =
    r.referral_paid_out || !r.referral_name || (r.referral_share_amount || 0) <= 0
  const client_side_complete = Boolean(r.was_it_paid && investorOk && referralOk)
  return {
    ...r,
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
