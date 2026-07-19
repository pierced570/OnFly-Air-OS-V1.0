import { describe, expect, it } from 'vitest'
import {
  doorFitsPiece,
  rankOperatorsForMission,
  scoreAircraftForMission,
} from './missionFit'
import type { Piece } from './dimsParser'

const skid: Piece = {
  l_in: 48,
  w_in: 40,
  h_in: 60,
  weight_lbs: 800,
  count: 1,
  stackable: false,
}

describe('doorFitsPiece', () => {
  it('accepts face that clears door', () => {
    expect(doorFitsPiece(52, 52, { l_in: 48, w_in: 40, h_in: 36 })).toBe('fits')
  })
  it('rejects oversized piece', () => {
    expect(doorFitsPiece(30, 30, { l_in: 48, w_in: 40, h_in: 60 })).toBe(
      'no_fit',
    )
  })
  it('unknown when no door dims', () => {
    expect(doorFitsPiece(null, null, { l_in: 48, w_in: 40, h_in: 60 })).toBe(
      'unknown',
    )
  })
})

describe('rankOperatorsForMission', () => {
  it('prefers door fit + closer base', () => {
    const ranked = rankOperatorsForMission(
      [
        {
          id: '1',
          operator_id: 'near',
          operator_name: 'Near Cargo',
          tail: 'N1',
          type_name: 'King Air 200',
          category: 'Turboprop',
          engines: 'Multi Turboprop',
          base_icao: 'KCAK',
          base: { lat: 40.92, lon: -81.44 },
          max_payload_lbs: 2500,
          door_w_in: 52,
          door_h_in: 52,
        },
        {
          id: '2',
          operator_id: 'far',
          operator_name: 'Far Cargo',
          tail: 'N2',
          type_name: 'King Air 200',
          category: 'Turboprop',
          engines: 'Multi Turboprop',
          base_icao: 'KMCO',
          base: { lat: 28.43, lon: -81.31 },
          max_payload_lbs: 2500,
          door_w_in: 52,
          door_h_in: 52,
        },
        {
          id: '3',
          operator_id: 'tiny',
          operator_name: 'Tiny Door',
          tail: 'N3',
          type_name: 'SR22',
          category: 'Piston',
          engines: 'Single Piston',
          base_icao: 'KCAK',
          base: { lat: 40.92, lon: -81.44 },
          max_payload_lbs: 800,
          door_w_in: 24,
          door_h_in: 30,
        },
      ],
      [skid],
      { lat: 40.92, lon: -81.44 },
    )
    expect(ranked[0]!.operator_name).toBe('Near Cargo')
    expect(ranked[0]!.label).toBe('best_fit')
    expect(ranked[0]!.best.door).toBe('fits')
    const tiny = ranked.find((r) => r.operator_id === 'tiny')!
    expect(tiny.best.hard_fail).toBe(true)
  })

  it('scores unknown door without excluding', () => {
    const s = scoreAircraftForMission(
      {
        id: 'x',
        operator_id: 'o',
        operator_name: 'Unknown Door LLC',
        tail: 'NX',
        type_name: 'Caravan',
        category: 'Turboprop',
        engines: 'Single Turboprop',
        base_icao: 'KCAK',
        base: { lat: 40.92, lon: -81.44 },
        max_payload_lbs: 3000,
        door_w_in: null,
        door_h_in: null,
      },
      [skid],
      { lat: 40.92, lon: -81.44 },
    )
    expect(s.door).toBe('unknown')
    expect(s.hard_fail).toBe(false)
    expect(s.reasons.some((r) => /door dims unknown/i.test(r))).toBe(true)
  })
})
