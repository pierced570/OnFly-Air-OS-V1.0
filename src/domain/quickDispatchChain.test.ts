import { describe, expect, it } from 'vitest'
import {
  buildQuickDispatchChain,
  parseLooseDurationMinutes,
} from './quickDispatchChain'

describe('parseLooseDurationMinutes', () => {
  it('parses hours and minutes', () => {
    expect(parseLooseDurationMinutes('1.5h')).toBe(90)
    expect(parseLooseDurationMinutes('90m')).toBe(90)
    expect(parseLooseDurationMinutes('1h 20min')).toBe(80)
    expect(parseLooseDurationMinutes('')).toBeNull()
  })
})

describe('buildQuickDispatchChain', () => {
  it('builds position → air → offload with desk times', () => {
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
      'air_leg',
      'offload',
    ])
    expect(chain[0]!.duration_min).toBe(120)
    expect(chain[1]!.duration_min).toBe(60)
    expect(chain[0]!.est_start).toBe('2026-07-26T12:00:00.000Z')
    expect(chain[0]!.est_end).toBe('2026-07-26T14:00:00.000Z')
    expect(chain[1]!.est_end).toBe('2026-07-26T15:00:00.000Z')
    expect(chain[1]!.from.icao).toBe('KCAK')
    expect(chain[1]!.to.icao).toBe('KMDW')
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
    expect(chain[1]!.duration_min).toBeGreaterThan(0)
    expect(chain[0]!.source).toBe('assumed')
  })

  it('handles multi-leg', () => {
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
    expect(chain.at(-1)!.type).toBe('offload')
  })
})
