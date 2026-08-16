import { describe, expect, it } from 'vitest'
import { buildQuickDispatchChain } from '@/domain/quickDispatchChain'
import { copyChainToTrip } from '@/domain/etaChain'
import { buildEtaSheetEmailTemplate } from '@/lib/buildEtaSheetEmail'
import type { EtaSheetContext } from '@/lib/etaSheet'
import type { TripStoreRow } from '@/lib/tripStore'

describe('buildEtaSheetEmailTemplate multi-leg', () => {
  it('skips Arrive after landing when the next leg starts at the same airport', () => {
    const chain = copyChainToTrip(
      buildQuickDispatchChain(
        [
          {
            origin_icao: 'KCAK',
            dest_icao: 'KHPN',
            repo_time: '1h',
            live_leg_time: '2h',
          },
          {
            origin_icao: 'KHPN',
            dest_icao: 'KCAK',
            repo_time: '1h',
            live_leg_time: '2h',
          },
        ],
        { timing: 'asap', now: new Date('2026-08-16T12:00:00.000Z') },
      ),
    )

    const trip = {
      id: 't1',
      ref: 84,
      code: 'T84',
      state: 'in_progress',
      lane: 'KCAK→KHPN · KHPN→KCAK',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [],
      offers: [],
      events: [],
      eta_chain: chain,
      service_pattern: 'A2A',
      promised_delivery: null,
      eta_defaults_snapshot: null,
      thread_number: null,
      thread_disbanded_at: null,
      legs: [],
      participants: [],
      thread: [],
      documents: [],
      invoice: null,
      po_number: '000067',
      quick: {
        client_id: 'c1',
        client_name: 'PSA',
        po: '000067',
        timing: 'asap',
        roundtrip: true,
        cargo_only: true,
        operator_name: 'Op',
        aircraft_type: 'TBM 700',
        tail: 'N123AB',
        vendor_cost: 0,
        client_price: 0,
        pay_terms: 'Net 30',
        invoice_email: '',
        cc_emails: [],
        send_invoice: false,
        referred_by: '',
        notes: '',
        legs: [
          {
            origin_icao: 'KCAK',
            dest_icao: 'KHPN',
            date: '',
            pax: 0,
            repo_time: '1h',
            live_leg_time: '2h',
          },
          {
            origin_icao: 'KHPN',
            dest_icao: 'KCAK',
            date: '',
            pax: 0,
            repo_time: '1h',
            live_leg_time: '2h',
          },
        ],
      },
    } as TripStoreRow

    const sheet: EtaSheetContext = {
      po: '000067',
      pattern: 'A2A',
      aircraft_type: 'TBM 700',
      tail: 'N123AB',
      operator_name: 'Op',
      promised_delivery_display: null,
      projected_delivery_display: null,
      delta_min: null,
      mileage: null,
      lines: [],
    }

    const tpl = buildEtaSheetEmailTemplate({
      trip,
      sheet,
      portalUrl: 'https://ofaops.onflyair.com/portal/track/x',
    })

    expect(tpl.laneShort).toBe('CAK → HPN · HPN → CAK')
    const labels = tpl.milestones.map((m) => m.label)
    // First Arrive CAK (position in) is fine; no second Arrive HPN after Landing HPN
    expect(labels.filter((l) => /^Arrive HPN$/i.test(l))).toHaveLength(0)
    expect(labels.some((l) => /Landing · HPN/i.test(l))).toBe(true)
    expect(labels.some((l) => /Wheels up · HPN/i.test(l))).toBe(true)
    expect(labels.some((l) => /Landing · CAK/i.test(l))).toBe(true)
    expect(labels.filter((l) => l === 'Time enroute').length).toBe(2)
    // Every stage should carry a projected value (clock or live-leg duration)
    expect(tpl.milestones.every((m) => Boolean(m.projected))).toBe(true)
  })

  it('uses accurate QD stage copy and +40 / +10 ground times', () => {
    const chain = copyChainToTrip(
      buildQuickDispatchChain(
        [
          {
            origin_icao: 'KTUS',
            dest_icao: 'KSAF',
            repo_time: '1h',
            live_leg_time: '2h',
          },
        ],
        { timing: 'asap', now: new Date('2026-08-16T17:00:00.000Z') },
      ),
    )
    const trip = {
      id: 't-qd',
      ref: 7,
      code: 'T7',
      state: 'booked',
      lane: 'KTUS→KSAF',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [],
      offers: [],
      events: [],
      eta_chain: chain,
      service_pattern: 'A2A',
      promised_delivery: null,
      eta_defaults_snapshot: null,
      thread_number: null,
      thread_disbanded_at: null,
      legs: [],
      participants: [],
      thread: [],
      documents: [],
      invoice: null,
      po_number: 'Test007',
      quick: {
        client_id: 'c1',
        client_name: 'Tester',
        po: 'Test007',
        timing: 'asap',
        roundtrip: false,
        cargo_only: true,
        operator_name: 'Op',
        aircraft_type: 'TBM 700',
        tail: 'N330DK',
        vendor_cost: 0,
        client_price: 0,
        pay_terms: 'Net 30',
        invoice_email: '',
        cc_emails: [],
        send_invoice: false,
        referred_by: '',
        notes: '',
        legs: [
          {
            origin_icao: 'KTUS',
            dest_icao: 'KSAF',
            date: '',
            pax: 0,
            repo_time: '1h',
            live_leg_time: '2h',
          },
        ],
      },
    } as TripStoreRow

    const sheet: EtaSheetContext = {
      po: 'Test007',
      pattern: 'A2A',
      aircraft_type: 'TBM 700',
      tail: 'N330DK',
      operator_name: 'Op',
      promised_delivery_display: null,
      projected_delivery_display: null,
      delta_min: null,
      mileage: null,
      lines: [],
    }

    const tpl = buildEtaSheetEmailTemplate({
      trip,
      sheet,
      portalUrl: 'https://ofaops.onflyair.com/portal/track/x',
    })

    const byLabel = Object.fromEntries(
      tpl.milestones.map((m) => [m.label, m]),
    )
    expect(byLabel['Arrive TUS']?.detail).toBe(
      'In position for pickup and loading',
    )
    expect(byLabel['Wheels up · TUS']?.detail).toMatch(/Assumes 40min/)
    expect(byLabel['Time enroute']?.detail).toBe('Live leg time')
    expect(byLabel['Time enroute']?.projected).toBe('2 hr')
    expect(byLabel['Landing · SAF']?.detail).toMatch(/Projected ETD \+ live leg/)
    expect(byLabel['Cargo handoff']?.detail).toBe(
      'Taxi to parking + shutdown time',
    )

    // Arrive + 40 = wheels up; landing = wheels up + 2h; handoff = landing + 10
    const arrive = chain.find((l) => l.type === 'position')!
    const turn = chain.find((l) => l.type === 'ground_stop')!
    const air = chain.find((l) => l.type === 'air_leg')!
    const off = chain.find((l) => l.type === 'offload')!
    expect(turn.est_start).toBe(arrive.est_end)
    expect(turn.duration_min).toBe(40)
    expect(air.est_start).toBe(turn.est_end)
    expect(air.duration_min).toBe(120)
    expect(off.est_start).toBe(air.est_end)
    expect(off.duration_min).toBe(10)
  })
})
