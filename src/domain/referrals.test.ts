import { describe, expect, it } from 'vitest'
import {
  computeReferralShareAmount,
  summarizeReferralPayouts,
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
