import { describe, expect, it } from 'vitest'
import {
  availabilityEmailSubject,
  availabilityPingBody,
  availabilityPingHtml,
  availabilityPingSmsWithLink,
  availabilityPingWithLink,
  parseAvailabilityReply,
  quoteSubmittedDeskSms,
  quoteSubmittedDeskEmail,
} from './offers'

describe('offers language', () => {
  it('still parses legacy 1/yes and 2/no if someone texts back', () => {
    expect(parseAvailabilityReply('1')).toBe('available')
    expect(parseAvailabilityReply('YES')).toBe('available')
    expect(parseAvailabilityReply('2')).toBe('unavailable')
    expect(parseAvailabilityReply('no thanks')).toBe('unavailable')
    expect(parseAvailabilityReply('maybe')).toBeNull()
  })

  it('ping copy is short — no mission details in the email', () => {
    const body = availabilityPingBody('CAK→MDW', '~800 lbs freight', '14:00E')
    expect(body).toContain('Charter flight quote request')
    expect(body.toLowerCase()).toContain('yes or no')
    expect(body.toLowerCase()).toContain('even a no helps')
    expect(body.toLowerCase()).toContain('tap the link')
    expect(body.toLowerCase()).not.toContain('bid')
    expect(body).not.toContain('CAK→MDW')
    expect(body).not.toContain('800 lbs')
    expect(body).not.toContain('14:00E')
    expect(body).not.toMatch(/reply 1/i)
  })

  it('SMS body is short and includes the offer link', () => {
    const sms = availabilityPingSmsWithLink(
      'tok123',
      'https://ofaops.onflyair.com',
    )
    expect(sms).toContain('OnFly charter quote request')
    expect(sms).toContain('https://ofaops.onflyair.com/offer/tok123')
    expect(sms.toLowerCase()).toContain('yes or no')
    expect(sms.toLowerCase()).not.toContain('bid')
    expect(sms.toLowerCase()).not.toContain('email')
  })

  it('link body and html point at the offer page without details line', () => {
    const text = availabilityPingWithLink(
      'KCAK→KHPN',
      '2 pax',
      'ASAP',
      'tok123',
      'https://ofaops.onflyair.com',
    )
    expect(text).toContain('https://ofaops.onflyair.com/offer/tok123')
    expect(text).not.toContain('KCAK→KHPN')
    expect(text).not.toContain('2 pax')

    const html = availabilityPingHtml(
      'KCAK→KHPN',
      '2 pax',
      'ASAP',
      'tok123',
      'https://ofaops.onflyair.com',
    )
    expect(html).toContain('href="https://ofaops.onflyair.com/offer/tok123"')
    expect(html).toContain('Charter flight quote request')
    expect(html).toMatch(/Yes/)
    expect(html).toMatch(/No/)
    expect(html).toMatch(/Open request/)
    expect(html).not.toContain('KCAK→KHPN')
    expect(html).not.toContain('2 pax')
    expect(html).not.toMatch(/Reply 1/i)
    expect(availabilityEmailSubject('KCAK→KHPN')).toBe(
      'Charter flight quote request',
    )
  })

  it('desk quote-submitted SMS names the operator', () => {
    expect(quoteSubmittedDeskSms('Charlie Jets')).toBe(
      'OnFly: quote submitted by Charlie Jets',
    )
    expect(
      quoteSubmittedDeskSms('Alpha Air', {
        lane: 'KCAK→KHPN',
        tripCode: 'UZ300',
      }),
    ).toBe('OnFly: quote submitted by Alpha Air · KCAK→KHPN · UZ300')
    expect(quoteSubmittedDeskSms('  ')).toContain('an operator')
    expect(quoteSubmittedDeskSms('Tester').toLowerCase()).not.toContain('bid')
  })

  it('desk quote-submitted email names the operator and lane', () => {
    const { subject, text } = quoteSubmittedDeskEmail({
      operatorName: 'Charlie Jets',
      lane: 'KCAK→KHPN',
      tripCode: 'UZ300',
      typeName: 'Citation CJ3',
      tail: 'N9ZZ',
      priceNet: 5000,
      tripPath: '/trips/abc',
    })
    expect(subject).toBe('OnFly: quote submitted by Charlie Jets · KCAK→KHPN')
    expect(text).toContain('Charlie Jets')
    expect(text).toContain('KCAK→KHPN')
    expect(text).toContain('UZ300')
    expect(text).toContain('$5,000 NET')
    expect(text).toContain('/trips/abc')
    expect(text.toLowerCase()).not.toContain('bid')
    expect(text).toMatch(/email notification only/i)
  })
})
