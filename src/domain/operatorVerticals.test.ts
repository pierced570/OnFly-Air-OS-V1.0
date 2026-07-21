import { describe, expect, it } from 'vitest'
import {
  buildVerticalBoard,
  classifyAircraftVertical,
  payloadCapability,
} from './operatorVerticals'

describe('classifyAircraftVertical', () => {
  it('maps piston / turboprop engines', () => {
    expect(
      classifyAircraftVertical({
        category: 'Piston',
        engines: 'Single Piston',
        type_name: 'Cirrus SR22',
      }),
    ).toBe('sep')
    expect(
      classifyAircraftVertical({
        category: 'Piston',
        engines: 'Multi Piston',
        type_name: 'Baron 58',
      }),
    ).toBe('mep')
    expect(
      classifyAircraftVertical({
        category: 'Turboprop',
        engines: 'Single Turboprop',
        type_name: 'TBM',
      }),
    ).toBe('setp')
    expect(
      classifyAircraftVertical({
        category: 'Turboprop',
        engines: 'Multi Turboprop',
        type_name: 'King Air 200',
      }),
    ).toBe('metp')
  })

  it('maps jets and cargo', () => {
    expect(
      classifyAircraftVertical({
        category: 'Light Jet',
        engines: 'Turbine',
        type_name: 'Citation Mustang',
      }),
    ).toBe('vlj_light')
    expect(
      classifyAircraftVertical({
        category: 'Heavy Jet',
        engines: 'Turbine',
        type_name: 'Gulfstream',
      }),
    ).toBe('mid_heavy')
    expect(
      classifyAircraftVertical({
        category: 'Midsize Jet (Cargo)',
        engines: 'Turbine',
        type_name: 'Citation',
      }),
    ).toBe('cargo')
  })
})

describe('buildVerticalBoard', () => {
  it('places operators in columns and ranks by NM', () => {
    const cols = buildVerticalBoard({
      operators: [
        { id: 'a', name: 'Near Air', base_icao: 'KCAK' },
        { id: 'b', name: 'Far Air', base_icao: 'KMCO' },
      ],
      aircraft: [
        {
          operator_id: 'a',
          type_name: 'King Air 200',
          category: 'Turboprop',
          engines: 'Multi Turboprop',
          base_icao: 'KCAK',
          tail: 'N1',
        },
        {
          operator_id: 'b',
          type_name: 'King Air 350',
          category: 'Turboprop',
          engines: 'Multi Turboprop',
          base_icao: 'KMCO',
          tail: 'N2',
        },
      ],
      origin: { lat: 40.92, lon: -81.44 },
      nmFrom: (_a, _b, lat2) => (Math.abs(lat2 - 40.92) < 0.1 ? 5 : 800),
      lookupBase: (icao) =>
        icao === 'KCAK'
          ? { lat: 40.92, lon: -81.44 }
          : { lat: 28.4, lon: -81.3 },
      sortBy: 'distance',
    })
    const metp = cols.find((c) => c.id === 'metp')!
    expect(metp.operator_count).toBe(2)
    expect(metp.operators[0]!.operator_name).toBe('Near Air')
    expect(metp.operators[0]!.nm_from_origin).toBe(5)
  })

  it('sorts by aircraft type name', () => {
    const cols = buildVerticalBoard({
      operators: [
        { id: 'a', name: 'Zulu Air', base_icao: 'KCAK' },
        { id: 'b', name: 'Alpha Air', base_icao: 'KCAK' },
      ],
      aircraft: [
        {
          operator_id: 'a',
          type_name: 'King Air 200',
          category: 'Turboprop',
          engines: 'Multi Turboprop',
          base_icao: 'KCAK',
          tail: 'N1',
          seats: 8,
        },
        {
          operator_id: 'b',
          type_name: 'Beech 1900',
          category: 'Turboprop',
          engines: 'Multi Turboprop',
          base_icao: 'KCAK',
          tail: 'N2',
          seats: 19,
        },
      ],
      sortBy: 'type',
    })
    const metp = cols.find((c) => c.id === 'metp')!
    expect(metp.operators.map((o) => o.primary_type)).toEqual([
      'Beech 1900',
      'King Air 200',
    ])
  })

  it('sorts by pax seats and filters cargo capability', () => {
    const cols = buildVerticalBoard({
      operators: [
        { id: 'a', name: 'Cargo Co', base_icao: 'KCAK' },
        { id: 'b', name: 'Pax Co', base_icao: 'KCAK' },
        { id: 'c', name: 'Both Co', base_icao: 'KCAK' },
      ],
      aircraft: [
        {
          operator_id: 'a',
          type_name: 'Caravan Cargo',
          category: 'Turboprop',
          engines: 'Single Turboprop',
          base_icao: 'KCAK',
          tail: 'N1',
          cargo_pax: 'Cargo only',
          seats: 2,
        },
        {
          operator_id: 'b',
          type_name: 'Citation',
          category: 'Light Jet',
          engines: 'Turbine',
          base_icao: 'KCAK',
          tail: 'N2',
          cargo_pax: 'Pax only',
          seats: 6,
        },
        {
          operator_id: 'c',
          type_name: 'King Air',
          category: 'Turboprop',
          engines: 'Multi Turboprop',
          base_icao: 'KCAK',
          tail: 'N3',
          cargo_pax: 'Cargo/Pax',
          seats: 9,
        },
      ],
      sortBy: 'pax_seats',
      payloadFilter: 'pax',
    })
    const allOps = cols.flatMap((c) => c.operators)
    expect(allOps.map((o) => o.operator_name).sort()).toEqual([
      'Both Co',
      'Pax Co',
    ])
    expect(allOps.find((o) => o.operator_name === 'Both Co')?.max_seats).toBe(9)
  })
})

describe('payloadCapability', () => {
  it('parses cargo / pax / both tags', () => {
    expect(payloadCapability('Cargo only')).toBe('cargo')
    expect(payloadCapability('Pax only')).toBe('pax')
    expect(payloadCapability('Cargo/Pax')).toBe('both')
    expect(payloadCapability(null)).toBe('unknown')
  })
})
