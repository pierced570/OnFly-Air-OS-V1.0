import { describe, expect, it } from 'vitest'
import {
  emptyClientOnboardDraft,
  laneCityHints,
  validateClientOnboard,
} from './clientOnboard'

describe('validateClientOnboard', () => {
  it('requires core fields', () => {
    const issues = validateClientOnboard(emptyClientOnboardDraft())
    expect(issues.map((i) => i.field)).toEqual(
      expect.arrayContaining([
        'legal_name',
        'address',
        'ops',
        'ap',
        'front_desk_phone',
        'emergency',
        'lanes',
      ]),
    )
  })

  it('passes a minimal complete draft', () => {
    const d = emptyClientOnboardDraft()
    d.legal_name = 'Acme Air Parts'
    d.address = {
      street: '100 Hangar Way',
      city: 'Akron',
      state: 'OH',
      zip: '44306',
    }
    d.ops = {
      name: 'Ops Desk',
      email: 'ops@acme.example',
      phone: '330-555-0100',
    }
    d.ap_same_as_ops = true
    d.front_desk_phone = '330-555-0100'
    d.emergency_same_as_ops = true
    d.no_frequent_lanes = true
    expect(validateClientOnboard(d)).toEqual([])
  })

  it('extracts city hints from lanes', () => {
    expect(
      laneCityHints([
        {
          origin: 'KCAK',
          destination: 'KMDW',
          origin_city: 'Akron, OH',
          destination_city: 'Chicago, IL',
        },
      ]),
    ).toEqual(
      expect.arrayContaining(['Akron, OH', 'Chicago, IL', 'KCAK', 'KMDW']),
    )
  })
})
