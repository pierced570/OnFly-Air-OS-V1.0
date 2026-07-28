import { describe, expect, it } from 'vitest'
import {
  formatPortalGrantLine,
  isValidPortalGrantEmail,
  normalizePortalGrantEmail,
} from './portalAccess'

describe('portalAccess', () => {
  it('normalizes and validates emails', () => {
    expect(normalizePortalGrantEmail('  Pierce@OnFlyAir.com ')).toBe(
      'pierce@onflyair.com',
    )
    expect(isValidPortalGrantEmail('a@b.co')).toBe(true)
    expect(isValidPortalGrantEmail('nope')).toBe(false)
  })

  it('formats desk list lines', () => {
    expect(
      formatPortalGrantLine({
        email: 'ops@acme.com',
        clientName: 'Acme Air Cargo',
        label: 'Sam',
      }),
    ).toBe('ops@acme.com → Acme Air Cargo (Sam)')
    expect(
      formatPortalGrantLine({
        email: 'ops@acme.com',
        clientName: 'Acme Air Cargo',
      }),
    ).toBe('ops@acme.com → Acme Air Cargo')
  })
})
