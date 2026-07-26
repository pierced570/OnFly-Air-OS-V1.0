import { describe, expect, it } from 'vitest'
import {
  hardQuoteClientStatus,
  hardQuoteClientStatusLabel,
} from './hardQuoteClientStatus'

describe('hardQuoteClientStatus', () => {
  it('is pending while quote is out', () => {
    expect(
      hardQuoteClientStatus({ trip_state: 'quoted_hard' }),
    ).toBe('pending')
    expect(hardQuoteClientStatusLabel('pending')).toBe('Pending update')
  })

  it('is accepted when booked or stamped', () => {
    expect(
      hardQuoteClientStatus({ trip_state: 'booked' }),
    ).toBe('accepted')
    expect(
      hardQuoteClientStatus({
        trip_state: 'quoted_hard',
        client_decision: 'accepted',
      }),
    ).toBe('accepted')
    expect(hardQuoteClientStatusLabel('accepted')).toBe('Accepted (Yes)')
  })

  it('is declined when lost or stamped', () => {
    expect(hardQuoteClientStatus({ trip_state: 'lost' })).toBe('declined')
    expect(
      hardQuoteClientStatus({
        trip_state: 'quoted_hard',
        declined_at: '2026-07-26T12:00:00.000Z',
      }),
    ).toBe('declined')
    expect(
      hardQuoteClientStatus({
        trip_state: 'quoted_hard',
        client_decision: 'declined',
      }),
    ).toBe('declined')
    expect(hardQuoteClientStatusLabel('declined')).toBe('Declined (No)')
  })
})
