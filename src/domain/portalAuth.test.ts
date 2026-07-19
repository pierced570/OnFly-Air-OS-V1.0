import { describe, expect, it } from 'vitest'
import { mapPortalTripRow, portalEmailFromUser } from '@/domain/portalAuth'

describe('portalAuth', () => {
  it('normalizes email from auth user', () => {
    expect(portalEmailFromUser({ email: 'Ops@Acme.COM' })).toBe('ops@acme.com')
  })

  it('maps safe portal trip card without cost fields', () => {
    const card = mapPortalTripRow({
      id: 'a',
      ref: 12,
      state: 'booked',
      lane_label: 'KTEB→KORD',
      ready_label: 'ASAP',
      payload_summary: 'cargo',
      cost: 9999,
      margin: 0.4,
    })
    expect(card.lane).toBe('KTEB→KORD')
    expect(card).not.toHaveProperty('cost')
  })
})
