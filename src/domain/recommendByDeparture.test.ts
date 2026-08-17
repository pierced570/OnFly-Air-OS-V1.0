import { describe, expect, it } from 'vitest'
import type { BasePriorityList } from './basePriority'
import {
  pickRecommendListForDeparture,
  recommendBaseIcaoMatch,
} from './recommendByDeparture'

function list(
  partial: Partial<BasePriorityList> & {
    id: string
    client_name: string
    base_icao: string | null
  },
): BasePriorityList {
  return {
    base_label: partial.base_label ?? partial.client_name,
    entries: partial.entries ?? [
      {
        id: `${partial.id}-e1`,
        rank: 1,
        company_name: 'Alpha Air',
        operator_id: 'op-a',
        match_status: 'confirmed',
        general_email: '',
        contact_phone: '',
        company_phone: '',
        phone_24hr: '',
        call_lines: [],
        notes: '',
        caps: {
          pax: true,
          cargo: true,
          hazmat: false,
          medevac: false,
          hrs24: false,
        },
        call_out_time: '',
        usefulness: 5,
        approval_tier: 'approved',
        operator_base_icao: partial.base_icao ?? '',
        fleet_types_csv: '',
        aircraft_locations_csv: '',
      },
    ],
    ...partial,
  }
}

describe('recommendByDeparture', () => {
  const lists: BasePriorityList[] = [
    list({ id: 'psa-cak', client_name: 'PSA', base_icao: 'KCAK' }),
    list({ id: 'psa-cvg', client_name: 'PSA', base_icao: 'KCVG' }),
    list({ id: 'breeze-pvu', client_name: 'Breeze', base_icao: 'KPVU' }),
    list({
      id: 'heavy',
      client_name: 'Heavy Cargo Carriers',
      base_icao: null,
    }),
  ]

  it('matches ICAO with or without leading K', () => {
    expect(recommendBaseIcaoMatch('KCAK', 'CAK')).toBe(true)
    expect(recommendBaseIcaoMatch('KCAK', 'KCVG')).toBe(false)
  })

  it('picks the exact Recommend base for the departure airport', () => {
    const pick = pickRecommendListForDeparture('CAK', lists, {
      preferredClientName: 'PSA',
    })
    expect(pick.match).toBe('exact')
    expect(pick.list?.id).toBe('psa-cak')
    expect(pick.distanceNm).toBe(0)
    expect(pick.entries[0]?.company_name).toBe('Alpha Air')
  })

  it('falls back to the closest listed base when none match', () => {
    // KCLE is near KCAK / KCVG — should pick a PSA Ohio base, not Utah.
    const pick = pickRecommendListForDeparture('KCLE', lists, {
      preferredClientName: 'PSA',
    })
    expect(pick.match).toBe('closest')
    expect(pick.list?.client_name).toBe('PSA')
    expect(pick.list?.base_icao).not.toBe('KPVU')
    expect(pick.distanceNm).toBeGreaterThan(0)
  })

  it('returns none when departure cannot be resolved', () => {
    const pick = pickRecommendListForDeparture('ZZZZ', lists)
    expect(pick.match).toBe('none')
    expect(pick.list).toBeNull()
  })
})
