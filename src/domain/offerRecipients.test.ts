import { describe, expect, it } from 'vitest'
import {
  formatOfferQuoteSummary,
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
    expect(offerRecipientStatusLabel('yes')).toBe('Yes')
    expect(offerRecipientStatusLabel('no')).toBe('No')
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
