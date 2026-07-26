import { describe, expect, it } from 'vitest'
import {
  availabilityEmailSubject,
  availabilityPingBody,
  feeScopeFromIncludes,
  offerPublicUrl,
  parseAvailabilityReply,
} from './offers'

describe('offers language', () => {
  it('parses 1/yes and 2/no', () => {
    expect(parseAvailabilityReply('1')).toBe('available')
    expect(parseAvailabilityReply('YES')).toBe('available')
    expect(parseAvailabilityReply('2')).toBe('unavailable')
    expect(parseAvailabilityReply('no thanks')).toBe('unavailable')
    expect(parseAvailabilityReply('maybe')).toBeNull()
  })

  it('ping copy says trip offer never bid and includes link', () => {
    const body = availabilityPingBody(
      'CAK→MDW',
      '~800 lbs freight',
      '14:00E',
      'https://app.example/offer/abc',
    )
    expect(body.toLowerCase()).toContain('trip offer')
    expect(body.toLowerCase()).not.toContain('bid')
    expect(body).toContain('https://app.example/offer/abc')
    expect(body).toMatch(/1 YES/)
  })

  it('builds public offer URL and email subject', () => {
    expect(offerPublicUrl('tok123', 'https://app.onflyair.com')).toBe(
      'https://app.onflyair.com/offer/tok123',
    )
    expect(availabilityEmailSubject('KCVG→KHPN')).toMatch(/trip offer/)
  })

  it('maps tax/fees checkboxes to fee_scope', () => {
    expect(feeScopeFromIncludes(false, false)).toBe('aircraft_only')
    expect(feeScopeFromIncludes(true, false)).toBe('aircraft_and_fees')
    expect(feeScopeFromIncludes(false, true)).toBe('aircraft_and_fees')
  })
})
