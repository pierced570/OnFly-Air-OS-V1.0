import { describe, expect, it } from 'vitest'
import {
  buildMilestones,
  buildPortalTrackingView,
  interpolateGc,
  resolveAircraftPosition,
  type PortalTrackingTripInput,
} from './portalTracking'
import type { ChainLeg } from './etaChain'

function sampleD2d(overrides?: Partial<PortalTrackingTripInput>): PortalTrackingTripInput {
  const chain: ChainLeg[] = [
    {
      seq: 1,
      type: 'position',
      branch: 'air',
      label: 'TTP',
      event: 'In Position',
      from: { lat: 41.5, lon: -81.5, icao: 'KCGF', tz: 'America/New_York' },
      to: { lat: 40.9, lon: -81.4, icao: 'KCAK', tz: 'America/New_York' },
      est_start: '2026-07-15T13:00:00.000Z',
      est_end: '2026-07-15T15:00:00.000Z',
      duration_min: 120,
      source: 'assumed',
      duration_source: 'assumed',
      duration_key: 'acft_ttp',
    },
    {
      seq: 2,
      type: 'ground_stop',
      branch: 'air',
      label: 'Turn',
      event: 'Ready Wheels Up',
      from: { lat: 40.9, lon: -81.4, icao: 'KCAK', tz: 'America/New_York' },
      to: { lat: 40.9, lon: -81.4, icao: 'KCAK', tz: 'America/New_York' },
      est_start: '2026-07-15T15:00:00.000Z',
      est_end: '2026-07-15T16:00:00.000Z',
      duration_min: 60,
      source: 'assumed',
      duration_source: 'assumed',
      duration_key: 'acft_turn',
    },
    {
      seq: 3,
      type: 'air_leg',
      branch: 'merged',
      label: 'Live',
      event: 'Wheels Up → Wheels Down',
      from: { lat: 40.9, lon: -81.4, icao: 'KCAK', tz: 'America/New_York' },
      to: { lat: 41.78, lon: -87.75, icao: 'KMDW', tz: 'America/Chicago' },
      est_start: '2026-07-15T16:00:00.000Z',
      est_end: '2026-07-15T17:30:00.000Z',
      duration_min: 90,
      source: 'assumed',
      duration_source: 'assumed',
      duration_key: 'air_time',
      distance_nm: 280,
    },
  ]
  return {
    ref: 2101,
    lane: 'KCAK → KMDW',
    state: 'booked',
    ready_label: 'ASAP',
    payload_summary: 'cargo',
    service_pattern: 'A2A',
    promised_delivery: '2026-07-15T17:30:00.000Z',
    eta_chain: chain,
    legs: chain.map((c, i) => ({
      seq: c.seq,
      type: c.type,
      label: c.label,
      status: i === 0 ? 'active' : 'pending',
      origin: c.from.icao,
      dest: c.to.icao,
      est_start: c.est_start,
      est_end: c.est_end,
      actual_start: null,
      actual_end: null,
    })),
    events: [
      {
        at: '2026-07-15T12:00:00.000Z',
        actor: 'dispatcher',
        kind: 'estimated_quote_sent',
        payload: {},
      },
      {
        at: '2026-07-15T12:30:00.000Z',
        actor: 'system',
        kind: 'eta_chain_copied_to_trip',
        payload: {},
      },
    ],
    documents: [
      {
        id: 'd1',
        kind: 'eta_sheet',
        title: 'ETA sheet',
        at: '2026-07-15T12:30:00.000Z',
        url: '#eta',
      },
    ],
    tail: 'N123AB',
    aircraft_type: 'King Air 200',
    ...overrides,
  }
}

describe('portalTracking', () => {
  it('interpolates great-circle midpoint', () => {
    const mid = interpolateGc(
      { lat: 0, lon: 0 },
      { lat: 0, lon: 10 },
      0.5,
    )
    expect(mid.lat).toBeCloseTo(0, 1)
    expect(mid.lon).toBeCloseTo(5, 1)
  })

  it('builds quote-approved milestone from estimate event', () => {
    const ms = buildMilestones(sampleD2d())
    const quote = ms.find((m) => m.kind === 'quote_approved')
    expect(quote?.done).toBe(true)
    expect(quote?.at).toBeTruthy()
    const booked = ms.find((m) => m.kind === 'booked')
    expect(booked?.done).toBe(true)
  })

  it('infers en-route position from ETA when mid-air', () => {
    const trip = sampleD2d({
      state: 'in_progress',
      eta_chain: sampleD2d().eta_chain.map((l) =>
        l.type === 'air_leg'
          ? { ...l, actual_start: '2026-07-15T16:00:00.000Z' }
          : l,
      ),
    })
    const pos = resolveAircraftPosition(
      trip,
      null,
      '2026-07-15T16:45:00.000Z',
    )
    expect(pos.source).toBe('eta')
    expect(pos.phase).toBe('airborne')
    expect(pos.lat).not.toBeNull()
    expect(pos.progressPct).toBeGreaterThan(40)
    expect(pos.summary).not.toMatch(/operator|margin|\$/i)
  })

  it('prefers ADS-B over ETA when live', () => {
    const trip = sampleD2d({ state: 'in_progress' })
    const pos = resolveAircraftPosition(trip, {
      tail: 'N123AB',
      lat: 41.2,
      lon: -84,
      alt: 18000,
      gs: 240,
      seenAt: '2026-07-15T16:20:00.000Z',
      laddBlocked: false,
      phase: 'airborne',
    })
    expect(pos.source).toBe('adsb')
    expect(pos.summary).toMatch(/Airborne/)
    expect(pos.altFt).toBe(18000)
  })

  it('buildPortalTrackingView never exposes money or carrier name', () => {
    const view = buildPortalTrackingView(sampleD2d())
    expect(view.carrierLabel).toBe('a vetted Part 135 carrier')
    expect(view.etaRows.length).toBeGreaterThan(0)
    expect(view.etaRows[0]!.estDisplay).toMatch(/Z|EDT|EST|CDT|CST|UTC/)
    expect(view.promisedDisplay).toBeTruthy()
    const blob = JSON.stringify(view)
    expect(blob).not.toMatch(/\$|margin|vendor/i)
  })
})
