import { describe, expect, it } from 'vitest'
import {
  describeOfferDestination,
  formatOfferAge,
  formatOfferDestinationConfirm,
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
    expect(offerRecipientStatusLabel('awaiting')).toBe(
      'Link ready — not notified',
    )
    expect(offerRecipientStatusLabel('awaiting', { notified: true })).toBe(
      'Notified — awaiting reply',
    )
  })

  it('formats link-ready vs notified timestamps', () => {
    const link = formatOfferSentAt(
      '2026-07-26T18:00:00.000Z',
      Date.parse('2026-07-26T19:30:00.000Z'),
      'link',
    )
    expect(link?.display).toMatch(/^Link ready @ /)
    expect(link?.ago).toBe('1h ago')
    const notified = formatOfferSentAt(
      '2026-07-26T18:00:00.000Z',
      Date.parse('2026-07-26T19:30:00.000Z'),
      'notified',
    )
    expect(notified?.display).toMatch(/^Notified @ /)
    expect(
      formatOfferAge(
        '2026-07-26T19:29:00.000Z',
        Date.parse('2026-07-26T19:30:00.000Z'),
      ),
    ).toBe('1m ago')
  })

  it('describes destinations and gaps for notify confirm', () => {
    const d = describeOfferDestination({
      contact_email: 'ops@alpha.example',
      contact_cell: '+15551212',
      quote_link_channel: 'both',
    })
    expect(d.can_notify).toBe(true)
    expect(d.will_reach).toEqual([
      'Email ops@alpha.example',
      'SMS +15551212',
    ])
    expect(d.summary).toContain('ops@alpha.example')

    const mock = describeOfferDestination({
      contact_email: '',
      contact_cell: '+14155550100',
      contact_cell_is_mock: true,
      quote_link_channel: 'sms',
    })
    expect(mock.can_notify).toBe(false)
    expect(mock.gaps[0]).toMatch(/mock/)

    const confirm = formatOfferDestinationConfirm(
      [
        {
          operator_name: 'Alpha Air',
          contact_email: 'ops@alpha.example',
          contact_cell: '',
          quote_link_channel: 'email',
        },
      ],
      'notify',
    )
    expect(confirm).toContain('ops@alpha.example')
    expect(confirm).toContain('Send notifications?')
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
