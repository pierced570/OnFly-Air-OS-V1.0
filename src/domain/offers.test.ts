import { describe, expect, it } from 'vitest'
import {
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

  it('ping copy is a charter quote request with Yes/No on the page', () => {
    const body = availabilityPingBody('CAK→MDW', '~800 lbs freight', '14:00E')
    expect(body).toContain('OnFly Air Charter Quote Request')
    expect(body.toLowerCase()).toContain('request for a flight')
    expect(body.toLowerCase()).toContain('yes or no')
    expect(body.toLowerCase()).toContain('even a no helps')
    expect(body.toLowerCase()).toContain('click the link')
    expect(body.toLowerCase()).not.toContain('bid')
    expect(body).not.toMatch(/reply 1/i)
    expect(body).not.toMatch(/1 yes/i)
  })

  it('link body and html point at the offer page', () => {
    const text = availabilityPingWithLink(
      'KCAK→KHPN',
      '2 pax',
      'ASAP',
      'tok123',
      'https://ofaops.onflyair.com',
    )
    expect(text).toContain('https://ofaops.onflyair.com/offer/tok123')
    const html = availabilityPingHtml(
      'KCAK→KHPN',
      '2 pax',
      'ASAP',
      'tok123',
      'https://ofaops.onflyair.com',
    )
    expect(html).toContain('href="https://ofaops.onflyair.com/offer/tok123"')
    expect(html).toContain('OnFly Air Charter Quote Request')
    expect(html).toMatch(/request for a flight/i)
    expect(html).toMatch(/Yes/)
    expect(html).toMatch(/No/)
    expect(html).toMatch(/View flight request/)
    expect(html).not.toMatch(/Reply 1/i)
  })
})
