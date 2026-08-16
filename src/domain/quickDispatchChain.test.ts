import { describe, expect, it } from 'vitest'
import { DEFAULT_ACFT_TURN_MIN } from './etaChain'
import {
  buildQuickDispatchChain,
  formatLooseDurationMinutes,
  parseLooseDurationMinutes,
} from './quickDispatchChain'

describe('parseLooseDurationMinutes', () => {
  it('parses hours and minutes', () => {
    expect(parseLooseDurationMinutes('1.5h')).toBe(90)
    expect(parseLooseDurationMinutes('90m')).toBe(90)
    expect(parseLooseDurationMinutes('1h 20min')).toBe(80)
    expect(parseLooseDurationMinutes('2')).toBe(120)
    expect(parseLooseDurationMinutes('')).toBeNull()
  })

  it('formats minutes back to loose strings', () => {
    expect(formatLooseDurationMinutes(120)).toBe('2h')
    expect(formatLooseDurationMinutes(90)).toBe('1h 30m')
    expect(formatLooseDurationMinutes(45)).toBe('45m')
    expect(formatLooseDurationMinutes(0)).toBe('')
  })
})

describe('buildQuickDispatchChain', () => {
  it('builds position → turn → air → offload (same spine as waterfall)', () => {
    const chain = buildQuickDispatchChain(
      [
        {
          origin_icao: 'KCAK',
          dest_icao: 'KMDW',
          repo_time: '2h',
          live_leg_time: '1h',
        },
      ],
      { timing: 'asap', now: new Date('2026-07-26T12:00:00.000Z') },
    )
    expect(chain.map((l) => l.type)).toEqual([
      'position',
      'ground_stop',
      'air_leg',
      'offload',
    ])
    expect(chain.map((l) => l.duration_key)).toEqual([
      'acft_ttp',
      'acft_turn',
      'air_time',
      'fbo_transfer',
    ])
    expect(chain[0]!.duration_min).toBe(120)
    expect(chain[1]!.duration_min).toBe(DEFAULT_ACFT_TURN_MIN)
    expect(chain[2]!.duration_min).toBe(60)
    expect(chain[0]!.est_start).toBe('2026-07-26T12:00:00.000Z')
    expect(chain[0]!.est_end).toBe('2026-07-26T14:00:00.000Z')
    // +40 turn default
    expect(chain[1]!.est_end).toBe('2026-07-26T14:40:00.000Z')
    expect(chain[2]!.est_end).toBe('2026-07-26T15:40:00.000Z')
    expect(chain[2]!.from.icao).toBe('KCAK')
    expect(chain[2]!.to.icao).toBe('KMDW')
  })

  it('honors quoted turn override (only booking delta)', () => {
    const chain = buildQuickDispatchChain(
      [
        {
          origin_icao: 'KCAK',
          dest_icao: 'KMDW',
          repo_time: '1h',
          live_leg_time: '1h',
          turn_time: '55m',
        },
      ],
      { now: new Date('2026-07-26T12:00:00.000Z') },
    )
    expect(chain[1]!.duration_min).toBe(55)
    expect(chain[1]!.source).toBe('quoted')
  })

  it('uses defaults when times blank', () => {
    const chain = buildQuickDispatchChain(
      [
        {
          origin_icao: 'KCAK',
          dest_icao: 'KMDW',
          repo_time: '',
          live_leg_time: '',
        },
      ],
      { now: new Date('2026-07-26T12:00:00.000Z') },
    )
    expect(chain[0]!.duration_min).toBe(120) // acft_ttp default
    expect(chain[1]!.duration_min).toBe(DEFAULT_ACFT_TURN_MIN)
    expect(chain[2]!.duration_min).toBeGreaterThan(0)
    expect(chain[0]!.source).toBe('assumed')
  })

  it('handles multi-leg with intermediate turns', () => {
    const chain = buildQuickDispatchChain(
      [
        {
          origin_icao: 'KCAK',
          dest_icao: 'KMDW',
          repo_time: '1h',
          live_leg_time: '1h',
        },
        {
          origin_icao: 'KMDW',
          dest_icao: 'KORD',
          repo_time: '30m',
          live_leg_time: '20m',
        },
      ],
      { now: new Date('2026-07-26T12:00:00.000Z') },
    )
    expect(chain.filter((l) => l.type === 'air_leg')).toHaveLength(2)
    expect(chain.filter((l) => l.duration_key === 'acft_turn')).toHaveLength(2)
    expect(chain.at(-1)!.type).toBe('offload')
  })
})
