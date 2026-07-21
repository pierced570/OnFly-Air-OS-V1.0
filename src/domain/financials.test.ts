import { describe, expect, it } from 'vitest'
import { computeFields, payTermsDays, type FinancialRecord } from './financials'

function base(partial: Partial<FinancialRecord> = {}): FinancialRecord {
  return {
    id: '1',
    is_legacy: false,
    source: 'live',
    date_of_flight: '2026-07-16',
    operator_po: 'PO #00338',
    client_name: 'PSA Airlines',
    route_text: 'KSAV → KHOU',
    aircraft_type: 'Barron',
    tail_number: 'N4380W',
    vendor_name: 'Axio',
    pay_terms: 'Net 30',
    referral_name: null,
    referral_share_amount: 0,
    client_subtotal_pre_tax: null,
    tax_total: 0,
    tax_breakdown: [],
    client_invoiced_amount: 13100,
    vendor_amount: 11713,
    margin: 0,
    funded_by: 'Jonny 1%',
    deposited_to: null,
    check_deposit_number: null,
    jonnys_profits: 0,
    jonny_invested: 0,
    jonny_money_owed: 0,
    jonny_money_returned: 0,
    ofa_profit_per_trip: 0,
    was_it_paid: false,
    vendor_paid: false,
    investor_paid: false,
    has_ofa_seen_profit: false,
    bill_logged_in_qb: false,
    referral_paid_out: false,
    vendor_bill_url: null,
    vendor_bill_verified: false,
    notes: null,
    ...partial,
  }
}

describe('computeFields', () => {
  it('Jonny 1% matches CSV sample PO #00338', () => {
    const c = computeFields(base())
    expect(c.margin).toBe(1387)
    expect(c.jonnys_profits).toBe(117.13)
    expect(c.jonny_invested).toBe(11713)
    expect(c.jonny_money_owed).toBe(11830.13)
  })

  it('investor_paid clears owed and sets returned', () => {
    const c = computeFields(base({ investor_paid: true }))
    expect(c.jonny_money_owed).toBe(0)
    expect(c.jonny_money_returned).toBe(11830.13)
  })

  it('legacy skips recompute', () => {
    const c = computeFields(
      base({
        is_legacy: true,
        margin: 999,
        jonnys_profits: 1,
        jonny_invested: 2,
        jonny_money_owed: 3,
      }),
    )
    expect(c.margin).toBe(999)
    expect(c.jonnys_profits).toBe(1)
  })
})

describe('payTermsDays', () => {
  it('parses Net 30', () => {
    expect(payTermsDays('Net 30')).toBe(30)
  })
})
