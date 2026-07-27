import { describe, expect, it } from 'vitest'
import {
  buildReferralMonthStatement,
  buildReferralMonthTabs,
  computeReferralShareAmount,
  referralFlightMonthKey,
  referralMonthLabel,
  referralPayoutReady,
  summarizeReferralPayouts,
  emptyReferralPerson,
} from './referrals'

describe('computeReferralShareAmount', () => {
  it('flat $ share', () => {
    expect(
      computeReferralShareAmount({
        share_mode: 'flat',
        share_value: 250,
        margin: 1000,
      }),
    ).toBe(250)
  })

  it('percent of margin', () => {
    expect(
      computeReferralShareAmount({
        share_mode: 'percent_margin',
        share_value: 10,
        margin: 1387,
      }),
    ).toBe(138.7)
  })

  it('override wins over defaults', () => {
    expect(
      computeReferralShareAmount({
        share_mode: 'percent_margin',
        share_value: 50,
        margin: 1000,
        override_amount: 75,
      }),
    ).toBe(75)
  })

  it('clamps negative to zero', () => {
    expect(
      computeReferralShareAmount({
        share_mode: 'flat',
        share_value: -10,
        margin: 100,
      }),
    ).toBe(0)
  })
})

describe('summarizeReferralPayouts', () => {
  it('rolls up unpaid and paid by name', () => {
    const rows = summarizeReferralPayouts(
      [
        {
          referral_name: 'Alex',
          referral_share_amount: 100,
          referral_paid_out: false,
        },
        {
          referral_name: 'Alex',
          referral_share_amount: 50,
          referral_paid_out: true,
        },
        {
          referral_name: 'Sam',
          referral_share_amount: 200,
          referral_paid_out: false,
        },
        { referral_name: null, referral_share_amount: 999, referral_paid_out: false },
      ],
      [
        { id: 'r1', name: 'Alex' },
        { id: 'r2', name: 'Sam' },
      ],
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      referral_name: 'Sam',
      unpaid_share: 200,
      trip_count: 1,
    })
    const alex = rows.find((r) => r.referral_name === 'Alex')
    expect(alex).toMatchObject({
      referral_id: 'r1',
      trip_count: 2,
      total_share: 150,
      unpaid_share: 100,
      paid_share: 50,
    })
  })
})

describe('monthly referral tabs', () => {
  const rows = [
    {
      id: 'a',
      date_of_flight: '2026-08-03',
      client_name: 'Acme',
      route_text: 'KCAK → KMDW',
      operator_po: 'PO-1',
      client_invoiced_amount: 10000,
      vendor_amount: 8000,
      margin: 2000,
      referral_name: 'Alex',
      referral_share_amount: 200,
      referral_paid_out: false,
    },
    {
      id: 'b',
      date_of_flight: '2026-08-20',
      client_name: 'Beta',
      route_text: 'KORD → KATL',
      operator_po: 'PO-2',
      client_invoiced_amount: 5000,
      vendor_amount: 4000,
      margin: 1000,
      referral_name: 'Alex',
      referral_share_amount: 100,
      referral_paid_out: false,
    },
    {
      id: 'c',
      date_of_flight: '2026-07-15',
      client_name: 'Acme',
      route_text: 'KCLE → KBOS',
      operator_po: 'PO-3',
      client_invoiced_amount: 8000,
      vendor_amount: 7000,
      margin: 1000,
      referral_name: 'Alex',
      referral_share_amount: 100,
      referral_paid_out: true,
    },
  ]

  it('keys months from flight date', () => {
    expect(referralFlightMonthKey('2026-08-31')).toBe('2026-08')
    expect(referralMonthLabel('2026-08')).toBe('August 2026')
  })

  it('builds monthly tabs with unpaid August', () => {
    const tabs = buildReferralMonthTabs(rows, 'Alex')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]).toMatchObject({
      month_key: '2026-08',
      trip_count: 2,
      gross_margin_total: 3000,
      unpaid_share: 300,
      has_unpaid: true,
      fully_paid: false,
    })
    expect(tabs[1]).toMatchObject({
      month_key: '2026-07',
      fully_paid: true,
      unpaid_share: 0,
    })
  })

  it('builds remittance statement with margin math', () => {
    const stmt = buildReferralMonthStatement({
      person: {
        name: 'Alex',
        email: 'alex@example.com',
        share_mode: 'percent_margin',
        share_value: 10,
      },
      monthKey: '2026-08',
      rows,
    })
    expect(stmt.share_total).toBe(300)
    expect(stmt.unpaid_share).toBe(300)
    expect(stmt.lines).toHaveLength(2)
    expect(stmt.body_text).toContain('10% of gross margin')
    expect(stmt.body_text).toContain('Amount due: $300.00')
    expect(stmt.body_text).toContain('margin $2,000.00 × 10%')
  })

  it('reports payout readiness gaps', () => {
    const p = {
      ...emptyReferralPerson(),
      id: 'r1',
      name: 'Alex',
      created_at: new Date().toISOString(),
    }
    expect(referralPayoutReady(p).ready).toBe(false)
    expect(referralPayoutReady(p).missing).toEqual(
      expect.arrayContaining(['email', 'W-9', 'routing number', 'account number']),
    )
  })
})
