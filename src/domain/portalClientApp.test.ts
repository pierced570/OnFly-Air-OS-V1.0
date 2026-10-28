import { describe, expect, it } from 'vitest'
import {
  buildPortalHistoryLedger,
  filterPortalHistoryLedger,
  partitionPortalAppTrips,
  portalAppStateLabel,
  portalAppTabFromPath,
  portalAppTabPath,
} from './portalClientApp'

describe('portalClientApp', () => {
  it('partitions active vs history trips', () => {
    const { active, history } = partitionPortalAppTrips([
      { state: 'in_progress' },
      { state: 'booked' },
      { state: 'delivered' },
      { state: 'invoiced' },
      { state: 'closed' },
    ])
    expect(active.map((t) => t.state)).toEqual(['in_progress', 'booked'])
    expect(history.map((t) => t.state)).toEqual([
      'delivered',
      'invoiced',
      'closed',
    ])
  })

  it('builds a ledger of trips, POs, and invoices without money language leaks', () => {
    const rows = buildPortalHistoryLedger([
      {
        id: 't1',
        ref: 88,
        state: 'invoiced',
        lane: 'KCLT → KICT',
        po_number: 'PO-4401',
        updated_at: '2026-08-17T12:00:00.000Z',
        invoice: {
          total: 12500,
          status: 'sent',
          url: '#inv-1',
          created_at: '2026-08-17T13:00:00.000Z',
        },
      },
      {
        id: 't2',
        ref: 70,
        state: 'delivered',
        lane: 'KCAK → KHPN',
        po_number: null,
        code: 'AB123',
        updated_at: '2026-08-10T12:00:00.000Z',
      },
    ])
    expect(rows.some((r) => r.kind === 'trip' && r.title === 'T-88')).toBe(true)
    expect(rows.some((r) => r.kind === 'po' && r.title === 'PO PO-4401')).toBe(
      true,
    )
    const inv = rows.find((r) => r.kind === 'invoice' && r.tripId === 't1')
    expect(inv?.amountUsd).toBe(12500)
    expect(inv?.href).toBe('#inv-1')
    expect(rows.some((r) => r.kind === 'po' && r.title === 'PO AB123')).toBe(
      true,
    )
    const blob = JSON.stringify(rows).toLowerCase()
    expect(blob).not.toMatch(/vendor|margin|operator_name/)
  })

  it('filters ledger by kind and search', () => {
    const rows = buildPortalHistoryLedger([
      {
        id: 't1',
        ref: 1,
        state: 'closed',
        lane: 'A → B',
        po_number: 'ZZ-9',
        invoice: { total: 100, status: 'paid' },
      },
    ])
    expect(filterPortalHistoryLedger(rows, { kind: 'invoice' })).toHaveLength(1)
    expect(
      filterPortalHistoryLedger(rows, { kind: 'all', q: 'zz-9' }).length,
    ).toBeGreaterThan(0)
    expect(filterPortalHistoryLedger(rows, { q: 'nope' })).toHaveLength(0)
  })

  it('maps tabs and friendly state labels', () => {
    expect(portalAppTabPath('book')).toBe('/portal/request')
    expect(portalAppTabFromPath('/portal/history')).toBe('history')
    expect(portalAppTabFromPath('/portal/login')).toBeNull()
    expect(portalAppStateLabel('in_progress')).toBe('Live')
    expect(portalAppStateLabel('quoted_hard')).toBe('Quote')
  })
})
