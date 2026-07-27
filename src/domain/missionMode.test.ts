import { describe, expect, it } from 'vitest'
import {
  buildMissionEndpoint,
  buildMissionOpsFlags,
  classifyEndpointText,
  cityHintFromAddress,
  missionLaneLabel,
  servicePatternFromEndpoints,
} from './missionMode'

describe('classifyEndpointText', () => {
  it('treats street addresses as door', () => {
    expect(
      classifyEndpointText('17 Acorn Drive Nesquehoning PA 18240'),
    ).toBe('door')
    expect(
      classifyEndpointText('3547 Seaward Circle Oceanside CA 92056'),
    ).toBe('door')
  })

  it('treats ICAO / airport cues as airport', () => {
    expect(classifyEndpointText('KCAK')).toBe('airport')
    expect(classifyEndpointText('KHPN')).toBe('airport')
  })
})

describe('service patterns', () => {
  it('maps A/D combinations', () => {
    expect(
      servicePatternFromEndpoints(
        { kind: 'airport' },
        { kind: 'airport' },
      ),
    ).toBe('A2A')
    expect(
      servicePatternFromEndpoints({ kind: 'door' }, { kind: 'door' }),
    ).toBe('D2D')
    expect(
      servicePatternFromEndpoints({ kind: 'door' }, { kind: 'airport' }),
    ).toBe('D2A')
    expect(
      servicePatternFromEndpoints({ kind: 'airport' }, { kind: 'door' }),
    ).toBe('A2D')
  })

  it('flags forklift required over 200 lb and courier on D2D', () => {
    const origin = buildMissionEndpoint(
      '17 Acorn Drive Nesquehoning PA 18240',
      'door',
    )
    const dest = buildMissionEndpoint(
      '3547 Seaward Circle Oceanside CA 92056',
      'door',
    )
    const flags = buildMissionOpsFlags({
      origin,
      dest,
      pieces_text: '300lbs 48x12x36',
    })
    expect(flags.pattern).toBe('D2D')
    expect(flags.forklift.level).toBe('required')
    expect(flags.needs_ground_courier).toBe(true)
    expect(flags.chips).toEqual(
      expect.arrayContaining(['D2D', 'forklift required', 'ground courier']),
    )
    expect(missionLaneLabel(origin, dest)).toMatch(/^D2D/)
  })

  it('extracts city hint from US address', () => {
    expect(cityHintFromAddress('17 Acorn Drive Nesquehoning PA 18240')).toMatch(
      /Nesquehoning/i,
    )
  })
})
