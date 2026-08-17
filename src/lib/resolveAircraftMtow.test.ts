import { beforeEach, describe, expect, it } from 'vitest'
import { resolveAircraftMtowLbs } from '@/lib/resolveAircraftMtow'
import {
  getCachedNetwork,
  invalidateNetworkCache,
  loadNetwork,
  patchCachedAircraft,
  upsertCachedAircraft,
} from '@/lib/networkData'

describe('resolveAircraftMtowLbs', () => {
  beforeEach(() => {
    invalidateNetworkCache()
  })

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

  it('looks up MTOW from network AC by tail when candidates empty (QD path)', async () => {
    await loadNetwork()
    const net = getCachedNetwork()
    expect(net).toBeTruthy()
    const op = net!.operators[0]
    expect(op).toBeTruthy()
    const row = upsertCachedAircraft({
      operator_id: op!.id,
      operator_name: op!.name,
      tail: 'N310QD',
      type_name: 'Cessna 310',
      id: 'ac-qd-mtow-test',
    })
    expect(row).toBeTruthy()
    patchCachedAircraft(row!.id, { mtow_lbs: 5500 })
    expect(
      resolveAircraftMtowLbs({
        tail: 'N310QD',
        typeName: 'Cessna 310',
        candidates: [],
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
