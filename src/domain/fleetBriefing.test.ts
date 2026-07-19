import { describe, expect, it } from 'vitest'
import {
  REST_IDLE_MS,
  formatIdleLabel,
  idleTopOperators,
  lastFlewMs,
  summarizeNationalWx,
  tripsCurrentlyFlying,
} from '@/domain/fleetBriefing'

describe('lastFlewMs', () => {
  const now = Date.parse('2026-07-19T12:00:00Z')

  it('uses now-ish for airborne', () => {
    const ms = lastFlewMs(
      {
        operator_name: 'A',
        phase: 'airborne',
        lastTakeoffAt: '2026-07-19T10:00:00Z',
        lastLandingAt: null,
        seenAt: '2026-07-19T11:55:00Z',
      },
      now,
    )
    expect(ms).toBe(Date.parse('2026-07-19T11:55:00Z'))
  })

  it('prefers latest landing/takeoff on ground', () => {
    const ms = lastFlewMs(
      {
        operator_name: 'A',
        phase: 'on_ground',
        lastTakeoffAt: '2026-07-18T20:00:00Z',
        lastLandingAt: '2026-07-18T22:00:00Z',
        seenAt: '2026-07-18T22:10:00Z',
      },
      now,
    )
    expect(ms).toBe(Date.parse('2026-07-18T22:10:00Z'))
  })

  it('returns null for no_data without times', () => {
    expect(
      lastFlewMs(
        {
          operator_name: 'A',
          phase: 'no_data',
          lastTakeoffAt: null,
          lastLandingAt: null,
        },
        now,
      ),
    ).toBeNull()
  })
})

describe('idleTopOperators', () => {
  const now = Date.parse('2026-07-19T12:00:00Z')
  const ops = [
    { id: '1', name: 'Big Air', aircraft_count: 40, base_icao: 'KCAK' },
    { id: '2', name: 'Mid Air', aircraft_count: 20, base_icao: 'KCLE' },
    { id: '3', name: 'Busy Air', aircraft_count: 15, base_icao: 'KCMH' },
    { id: '4', name: 'Tiny Air', aircraft_count: 2, base_icao: 'KBJJ' },
  ]

  it('lists top operators idle ≥10h', () => {
    const rows = idleTopOperators({
      operators: ops,
      nowMs: now,
      scanN: 4,
      topN: 8,
      tails: [
        {
          operator_id: '1',
          operator_name: 'Big Air',
          phase: 'on_ground',
          lastTakeoffAt: new Date(now - 14 * 3600000).toISOString(),
          lastLandingAt: new Date(now - 12 * 3600000).toISOString(),
        },
        {
          operator_id: '2',
          operator_name: 'Mid Air',
          phase: 'on_ground',
          lastTakeoffAt: new Date(now - 2 * 3600000).toISOString(),
          lastLandingAt: new Date(now - 1 * 3600000).toISOString(),
        },
        {
          operator_id: '3',
          operator_name: 'Busy Air',
          phase: 'airborne',
          lastTakeoffAt: new Date(now - 1 * 3600000).toISOString(),
          lastLandingAt: null,
          seenAt: new Date(now).toISOString(),
        },
      ],
    })
    expect(rows.map((r) => r.operator_name)).toEqual(['Big Air', 'Tiny Air'])
    expect(rows[0].status).toBe('idle_10h')
    expect(rows[0].idle_ms).toBeGreaterThanOrEqual(REST_IDLE_MS)
    expect(rows[1].status).toBe('unknown')
  })

  it('uses trip hints when ADS-B is dark', () => {
    const rows = idleTopOperators({
      operators: ops.slice(0, 2),
      nowMs: now,
      tails: [
        {
          operator_id: '1',
          operator_name: 'Big Air',
          phase: 'no_data',
          lastTakeoffAt: null,
          lastLandingAt: null,
        },
      ],
      tripHints: [
        {
          operator_id: '1',
          operator_name: 'Big Air',
          lastAt: new Date(now - 20 * 3600000).toISOString(),
        },
      ],
    })
    expect(rows[0].status).toBe('idle_10h')
    expect(rows[0].evidence).toBe('trip')
  })
})

describe('summarizeNationalWx', () => {
  it('headlines mostly VFR', () => {
    const s = summarizeNationalWx([
      { icao: 'KORD', region: 'Midwest', flightCat: 'VFR', tafWorstCat: 'VFR', hardFlags: [] },
      { icao: 'KATL', region: 'Southeast', flightCat: 'VFR', tafWorstCat: null, hardFlags: [] },
      { icao: 'KJFK', region: 'Northeast', flightCat: 'MVFR', tafWorstCat: 'IFR', hardFlags: [] },
    ])
    expect(s.counts.VFR).toBe(2)
    expect(s.headline).toMatch(/MVFR/)
    expect(s.worst.some((w) => w.icao === 'KJFK')).toBe(true)
  })

  it('calls out IFR/LIFR', () => {
    const s = summarizeNationalWx([
      { icao: 'KORD', region: 'Midwest', flightCat: 'IFR', tafWorstCat: 'IFR', hardFlags: ['low'] },
      { icao: 'KDEN', region: 'Rockies', flightCat: 'LIFR', tafWorstCat: 'LIFR', hardFlags: [] },
    ])
    expect(s.headline).toMatch(/IFR\/LIFR/)
  })
})

describe('tripsCurrentlyFlying', () => {
  it('includes in_progress and booked with open leg', () => {
    const rows = tripsCurrentlyFlying([
      {
        id: 'a',
        ref: 1,
        lane: 'KCAK→KORD',
        state: 'in_progress',
        operator_name: 'Big Air',
        legs: [
          {
            status: 'active',
            label: 'Air KCAK→KORD',
            actual_start: '2026-07-19T10:00:00Z',
            actual_end: null,
          },
        ],
      },
      {
        id: 'b',
        ref: 2,
        lane: 'KCLE→KBOS',
        state: 'booked',
        legs: [
          {
            status: 'pending',
            actual_start: null,
            actual_end: null,
          },
        ],
      },
      {
        id: 'c',
        ref: 3,
        lane: 'KDAY→KATL',
        state: 'booked',
        operator_name: 'Mid',
        legs: [
          {
            status: 'active',
            label: 'Air',
            actual_start: '2026-07-19T11:00:00Z',
            actual_end: null,
          },
        ],
      },
    ])
    expect(rows.map((r) => r.ref)).toEqual([1, 3])
  })
})

describe('formatIdleLabel', () => {
  it('formats hours', () => {
    expect(
      formatIdleLabel({
        operator_id: '1',
        operator_name: 'X',
        aircraft_count: 1,
        base_icao: null,
        status: 'idle_10h',
        idle_ms: 14 * 3600000,
        last_flew_at: null,
        evidence: 'adsb',
      }),
    ).toBe('Idle ~14h')
  })
})
