import { describe, expect, it } from 'vitest'
import {
  formatOfferAge,
  formatOfferQuoteSummary,
  formatOfferSentAt,
  offerRecipientStatus,
  offerRecipientStatusLabel,
} from './offerRecipients'

describe('offerRecipients', () => {
  it('maps offer states to yes / no / quote submitted', () => {
    expect(offerRecipientStatus('pinged')).toBe('awaiting')
    expect(offerRecipientStatus('available')).toBe('yes')
    expect(offerRecipientStatus('unavailable')).toBe('no')
    expect(offerRecipientStatus('quoted')).toBe('quote_submitted')
    expect(offerRecipientStatusLabel('quote_submitted')).toBe('Quote submitted')
    expect(offerRecipientStatusLabel('yes')).toBe('Accepted (Yes)')
    expect(offerRecipientStatusLabel('no')).toBe('Declined (No)')
    expect(offerRecipientStatusLabel('awaiting')).toBe('Sent — awaiting reply')
  })

  it('formats sent-at Zulu + age', () => {
    const sent = formatOfferSentAt('2026-07-26T18:00:00.000Z', Date.parse('2026-07-26T19:30:00.000Z'))
    expect(sent?.zulu).toContain('Z')
    expect(sent?.ago).toBe('1h ago')
    expect(formatOfferAge('2026-07-26T19:29:00.000Z', Date.parse('2026-07-26T19:30:00.000Z'))).toBe(
      '1m ago',
    )
  })

  it('formats quote summary for waterfall cards', () => {
    expect(
      formatOfferQuoteSummary({
        price_net: 4200.4,
        time_to_position_min: 90,
        live_leg_min: 75,
        fee_scope: 'aircraft_and_fees',
        tail: 'N123AB',
      }),
    ).toBe('NET $4200 · TTP 90m · live 75m · fees included · N123AB')
    expect(formatOfferQuoteSummary({ price_net: null })).toBeNull()
  })
})
