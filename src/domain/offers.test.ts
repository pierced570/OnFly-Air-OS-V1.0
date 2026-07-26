import { describe, expect, it } from 'vitest'
import {
  availabilityEmailSubject,
  availabilityPingBody,
  availabilityPingHtml,
  availabilityPingWithLink,
  parseAvailabilityReply,
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
})
