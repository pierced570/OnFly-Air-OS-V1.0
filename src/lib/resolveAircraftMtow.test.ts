import { describe, expect, it } from 'vitest'
import { resolveAircraftMtowLbs } from '@/lib/resolveAircraftMtow'

describe('resolveAircraftMtowLbs', () => {
  it('prefers explicit mtowLbs', () => {
    expect(
      resolveAircraftMtowLbs({
        mtowLbs: 5500,
        typeName: 'King Air 200',
        candidates: [{ mtow_lbs: 12500, type_name: 'King Air 200' }],
      }),
    ).toBe(5500)
  })

  it('uses candidate mtow when explicit is missing', () => {
    expect(
      resolveAircraftMtowLbs({
        selectedAircraftId: 'a1',
        candidates: [
          { aircraft_id: 'a1', tail: 'N310XX', mtow_lbs: 5500, type_name: 'Cessna 310' },
        ],
      }),
    ).toBe(5500)
  })

  it('returns null when nothing known (do not invent FET)', () => {
    expect(
      resolveAircraftMtowLbs({
        typeName: 'Totally Unknown Type XYZ',
        candidates: [],
      }),
    ).toBeNull()
  })
})
