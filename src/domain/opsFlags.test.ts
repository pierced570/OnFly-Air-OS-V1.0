import { describe, expect, it } from 'vitest'
import type { ChainLeg } from '@/domain/etaChain'
import {
  airportStopsFromChain,
  buildOpsSheetNotes,
  evaluateAfterHoursFlags,
  evaluateForkliftFlags,
  evaluateWxIfrFlags,
  isAfterHoursLocal,
  shouldApplyCalloutFee,
  type FboOpsSnap,
} from './opsFlags'

function leg(partial: Partial<ChainLeg> & Pick<ChainLeg, 'type' | 'from' | 'to' | 'est_start' | 'est_end'>): ChainLeg {
  return {
    seq: 1,
    branch: 'merged',
    label: partial.label ?? partial.type,
    event: partial.event ?? partial.type,
    duration_min: 30,
    source: 'assumed',
    duration_source: 'test',
    ...partial,
  }
}

describe('opsFlags', () => {
  it('detects after-hours local window', () => {
    // 05:00 America/New_York = 09:00Z in July (EDT)
    expect(
      isAfterHoursLocal('2026-07-26T09:00:00.000Z', 'America/New_York'),
    ).toBe(true)
    // 12:00 local EDT = 16:00Z
    expect(
      isAfterHoursLocal('2026-07-26T16:00:00.000Z', 'America/New_York'),
    ).toBe(false)
    // 22:30 local = 02:30Z next day
    expect(
      isAfterHoursLocal('2026-07-27T02:30:00.000Z', 'America/New_York'),
    ).toBe(true)
  })

  it('flags non-24hr FBO when wheels-down is after hours', () => {
    const chain: ChainLeg[] = [
      leg({
        type: 'air_leg',
        from: { lat: 0, lon: 0, icao: 'KCAK', tz: 'America/New_York' },
        to: { lat: 0, lon: 0, icao: 'KHPN', tz: 'America/New_York' },
        est_start: '2026-07-27T01:00:00.000Z',
        est_end: '2026-07-27T02:30:00.000Z', // 22:30 EDT
        event: 'Wheels Down',
      }),
    ]
    const stops = airportStopsFromChain(chain)
    expect(stops.some((s) => s.icao === 'KHPN')).toBe(true)

    const fbos: Record<string, FboOpsSnap> = {
      KHPN: {
        name: 'Local FBO',
        is_24hr: false,
        forklift: true,
        forklift_capacity_lbs: 3000,
        fee_callout: 200,
      },
    }
    const flags = evaluateAfterHoursFlags(stops, (icao) => fbos[icao] ?? null)
    expect(flags.some((f) => f.code === 'after_hours_no_24hr')).toBe(true)
    expect(shouldApplyCalloutFee(stops[0]!.atIso, stops[0]!.tz, fbos.KHPN!)).toBe(
      true,
    )
  })

  it('does not callout when FBO is 24hr', () => {
    const fbo: FboOpsSnap = {
      name: 'Signature',
      is_24hr: true,
      forklift: true,
      forklift_capacity_lbs: 5000,
      fee_callout: 150,
    }
    expect(
      shouldApplyCalloutFee(
        '2026-07-27T02:30:00.000Z',
        'America/New_York',
        fbo,
      ),
    ).toBe(false)
  })

  it('flags missing forklift when required', () => {
    const flags = evaluateForkliftFlags({
      level: 'required',
      heaviestLbs: 450,
      originIcao: 'KCAK',
      destIcao: 'KHPN',
      fboByIcao: (icao) =>
        icao === 'KCAK'
          ? {
              name: 'A',
              is_24hr: true,
              forklift: false,
              forklift_capacity_lbs: null,
              fee_callout: null,
            }
          : {
              name: 'B',
              is_24hr: true,
              forklift: true,
              forklift_capacity_lbs: 200,
              fee_callout: null,
            },
    })
    expect(flags.some((f) => f.code === 'forklift_required_missing')).toBe(true)
    expect(flags.some((f) => f.code === 'forklift_capacity_short')).toBe(true)
  })

  it('flags IFR/LIFR on destination briefs', () => {
    const flags = evaluateWxIfrFlags([
      { icao: 'KHPN', flightCat: 'IFR', tafWorstCat: 'LIFR' },
      { icao: 'KCAK', flightCat: 'VFR', tafWorstCat: 'VFR' },
    ])
    expect(flags.some((f) => f.code === 'ifr_metar' && f.icao === 'KHPN')).toBe(
      true,
    )
    expect(flags.some((f) => f.code === 'lifr_taf' && f.icao === 'KHPN')).toBe(
      true,
    )
    expect(flags.every((f) => f.icao !== 'KCAK')).toBe(true)
  })

  it('builds sheet notes for D2D + flags', () => {
    const notes = buildOpsSheetNotes({
      pattern: 'D2D',
      hasTruckLegs: true,
      forkliftLevel: 'required',
      flags: [
        {
          code: 'after_hours_no_24hr',
          severity: 'attn',
          icao: 'KHPN',
          title: 'After-hours · KHPN',
          detail: 'Not 24hr',
          field: 'after_hours_KHPN',
        },
      ],
    })
    expect(notes.some((n) => /Ground transport/i.test(n))).toBe(true)
    expect(notes.some((n) => /Forklift required/i.test(n))).toBe(true)
    expect(notes.some((n) => /After-hours/i.test(n))).toBe(true)
  })
})
