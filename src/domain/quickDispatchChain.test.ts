import { describe, expect, it } from 'vitest'
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
  it('builds position → load/taxi → air → parking with desk times', () => {
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
    expect(chain[0]!.duration_min).toBe(120)
    expect(chain[1]!.duration_min).toBe(40) // +40 loading/taxi
    expect(chain[2]!.duration_min).toBe(60)
    expect(chain[3]!.duration_min).toBe(10) // +10 parking/shutdown
    expect(chain[0]!.est_start).toBe('2026-07-26T12:00:00.000Z')
    expect(chain[0]!.est_end).toBe('2026-07-26T14:00:00.000Z') // Arrive CAK
    expect(chain[1]!.est_end).toBe('2026-07-26T14:40:00.000Z') // Wheels up
    expect(chain[2]!.est_start).toBe('2026-07-26T14:40:00.000Z')
    expect(chain[2]!.est_end).toBe('2026-07-26T15:40:00.000Z') // Landing
    expect(chain[3]!.est_end).toBe('2026-07-26T15:50:00.000Z') // Handoff
    expect(chain[2]!.from.icao).toBe('KCAK')
    expect(chain[2]!.to.icao).toBe('KMDW')
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
    expect(chain[1]!.type).toBe('ground_stop')
    expect(chain.find((l) => l.type === 'air_leg')!.duration_min).toBeGreaterThan(
      0,
    )
    expect(chain[0]!.source).toBe('assumed')
  })

  it('handles multi-leg with load/taxi on each departure', () => {
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
    expect(chain.filter((l) => l.type === 'ground_stop')).toHaveLength(2)
    // Second origin is previous dest — no reposition, just load/taxi.
    expect(chain.filter((l) => l.type === 'position')).toHaveLength(1)
    expect(chain.at(-1)!.type).toBe('offload')
    expect(chain.at(-1)!.duration_min).toBe(10)
  })
})
