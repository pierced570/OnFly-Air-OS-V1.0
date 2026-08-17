import { describe, expect, it } from 'vitest'
import {
  ALL_TIME_COLUMNS,
  allTimeRowsToCsv,
  buildAllTimeTripRow,
  isOnTime,
  mergeAllTimeTripRow,
  minutesBetween,
  summarizeAllTimeKpis,
} from '@/domain/allTimeInfo'

describe('allTimeInfo', () => {
  it('computes minutes and on-time slack', () => {
    expect(
      minutesBetween('2026-08-17T12:00:00Z', '2026-08-17T12:20:00Z'),
    ).toBe(20)
    expect(isOnTime('2026-08-17T12:00:00Z', '2026-08-17T12:10:00Z')).toBe(true)
    expect(isOnTime('2026-08-17T12:00:00Z', '2026-08-17T12:20:00Z')).toBe(false)
  })

  it('builds a CSV row from trip events + prices + ADS-B actuals', () => {
    const row = buildAllTimeTripRow(
      {
        id: 't1',
        ref: 42,
        code: 'AB042',
        state: 'delivered',
        lane: 'KCVG→KDAY',
        client_name: 'Athelo Group LLC',
        quick: {
          operator_name: 'PSA',
          aircraft_type: 'CRJ-700',
          tail: 'N700XX',
          vendor_cost: 8000,
          client_price: 11000,
          po: 'PO-1',
          referred_by: '',
        },
        invoice: { status: 'sent', total: 11000 },
        events: [
          {
            at: '2026-08-17T10:00:00Z',
            kind: 'desk_scratch_spool',
          },
          {
            at: '2026-08-17T10:08:00Z',
            kind: 'estimated_quote_sent',
          },
          {
            at: '2026-08-17T10:30:00Z',
            kind: 'state_transition',
            payload: { to: 'booked' },
          },
          {
            at: '2026-08-17T14:00:00Z',
            kind: 'adsb_actual_applied',
          },
          {
            at: '2026-08-17T16:00:00Z',
            kind: 'state_transition',
            payload: { to: 'delivered' },
          },
          {
            at: '2026-08-17T16:05:00Z',
            kind: 'invoice_emailed',
          },
        ],
        eta_chain: [
          {
            type: 'air_leg',
            est_start: '2026-08-17T12:00:00Z',
            est_end: '2026-08-17T13:00:00Z',
            actual_start: '2026-08-17T12:05:00Z',
            actual_end: '2026-08-17T13:02:00Z',
          },
        ],
        offers: [
          {
            state: 'selected',
            operator_name: 'PSA',
            tail: 'N700XX',
            type_name: 'CRJ-700',
            time_to_position_min: 45,
            price_net: 8000,
          },
        ],
      },
      { nowIso: '2026-08-17T17:00:00Z' },
    )

    expect(row.trip_code).toBe('AB042')
    expect(row.source).toBe('desk_scratch')
    expect(row.vendor_cost).toBe('8000')
    expect(row.client_price).toBe('11000')
    expect(row.margin).toBe('3000')
    expect(row.minutes_to_quote).toBe('8')
    expect(row.minutes_request_to_book).toBe('30')
    expect(row.time_to_position_min).toBe('45')
    expect(row.wheels_up_at).toBe('2026-08-17T12:05:00Z')
    expect(row.wheels_down_at).toBe('2026-08-17T13:02:00Z')
    expect(row.on_time_departure).toBe('yes')
    expect(row.on_time_arrival).toBe('yes')
    expect(row.invoice_sent_at).toBe('2026-08-17T16:05:00Z')
    expect(row.adsb_actuals_logged).toBe('yes')
  })

  it('marks discarded trips and merges stamps', () => {
    const a = buildAllTimeTripRow({
      id: 't2',
      state: 'quoted_estimated',
      events: [{ at: '2026-08-17T09:00:00Z', kind: 'created_from_estimate' }],
    })
    const b = buildAllTimeTripRow({
      id: 't2',
      state: 'discarded',
      discarded: true,
      discarded_at: '2026-08-17T11:00:00Z',
      events: [],
    })
    const merged = mergeAllTimeTripRow(a, b)
    expect(merged.discarded).toBe('yes')
    expect(merged.request_logged_at).toBe('2026-08-17T09:00:00Z')
    expect(merged.discarded_at).toBe('2026-08-17T11:00:00Z')
  })

  it('summarizes KPIs and exports CSV headers', () => {
    const rows = [
      buildAllTimeTripRow({
        id: 'a',
        state: 'booked',
        quick: { vendor_cost: 1000, client_price: 1500 },
        events: [
          { at: '2026-08-17T10:00:00Z', kind: 'quick_dispatch' },
          {
            at: '2026-08-17T10:00:00Z',
            kind: 'state_transition',
            payload: { to: 'booked' },
          },
        ],
        eta_chain: [
          {
            type: 'air_leg',
            est_start: '2026-08-17T12:00:00Z',
            est_end: '2026-08-17T13:00:00Z',
            actual_start: '2026-08-17T12:40:00Z',
            actual_end: '2026-08-17T13:40:00Z',
          },
        ],
      }),
      buildAllTimeTripRow({
        id: 'b',
        state: 'quoted_hard',
        discarded: true,
        discarded_at: '2026-08-17T12:00:00Z',
        events: [{ at: '2026-08-17T11:00:00Z', kind: 'created_from_request' }],
      }),
    ]
    const kpis = summarizeAllTimeKpis(rows)
    expect(kpis.trips_total).toBe(2)
    expect(kpis.trips_discarded).toBe(1)
    expect(kpis.trips_booked).toBe(1)
    expect(kpis.revenue_total).toBe(1500)
    expect(kpis.margin_total).toBe(500)
    expect(kpis.on_time_departure_pct).toBe(0)

    const csv = allTimeRowsToCsv(rows)
    expect(csv.split('\n')[0]).toBe(ALL_TIME_COLUMNS.join(','))
    expect(csv).toContain('a')
    expect(csv).toContain('discarded')
  })
})
