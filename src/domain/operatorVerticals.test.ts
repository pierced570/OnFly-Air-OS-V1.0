import { describe, expect, it } from 'vitest'
import {
  buildVerticalBoard,
  classifyAircraftVertical,
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
    })
    const metp = cols.find((c) => c.id === 'metp')!
    expect(metp.operator_count).toBe(2)
    expect(metp.operators[0]!.operator_name).toBe('Near Air')
    expect(metp.operators[0]!.nm_from_origin).toBe(5)
  })
})
