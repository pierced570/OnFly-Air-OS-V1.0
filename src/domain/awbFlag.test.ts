import { describe, expect, it } from 'vitest'
import {
  awbCreationNeeded,
  icaosFromLaneLabel,
  isUsTerritoryIcao,
  laneIsInternational,
} from '@/domain/awbFlag'

describe('awbFlag', () => {
  it('treats K / PA / PH / TJ as US territory', () => {
    expect(isUsTerritoryIcao('KGSP')).toBe(true)
    expect(isUsTerritoryIcao('KCAK')).toBe(true)
    expect(isUsTerritoryIcao('PANC')).toBe(true)
    expect(isUsTerritoryIcao('PHNL')).toBe(true)
    expect(isUsTerritoryIcao('TJSJ')).toBe(true)
    expect(isUsTerritoryIcao('CYYZ')).toBe(false)
    expect(isUsTerritoryIcao('MMMX')).toBe(false)
  })

  it('flags US→Canada as international', () => {
    expect(laneIsInternational('KGSP', 'CYYZ')).toBe(true)
    expect(laneIsInternational('KCAK', 'KBGR')).toBe(false)
  })

  it('parses lane labels', () => {
    expect(icaosFromLaneLabel('KGSP→CYYZ')).toEqual({
      origin: 'KGSP',
      dest: 'CYYZ',
    })
    expect(icaosFromLaneLabel('KCAK -> KBGR')).toEqual({
      origin: 'KCAK',
      dest: 'KBGR',
    })
  })

  it('requires cargo + international for AWB flag', () => {
    expect(
      awbCreationNeeded({
        payload_kind: 'cargo',
        lane: 'KGSP→CYYZ',
      }),
    ).toBe(true)
    expect(
      awbCreationNeeded({
        payload_kind: 'both',
        origin_icao: 'KTEB',
        dest_icao: 'CYYZ',
      }),
    ).toBe(true)
    expect(
      awbCreationNeeded({
        payload_kind: 'pax',
        lane: 'KGSP→CYYZ',
      }),
    ).toBe(false)
    expect(
      awbCreationNeeded({
        payload_kind: 'cargo',
        lane: 'KCAK→KBGR',
      }),
    ).toBe(false)
  })
})
