import { beforeEach, describe, expect, it } from 'vitest'
import {
  createAccountingAdapter,
  markMockInvoicePaid,
} from '@/adapters/accounting'
import { pollQbPaidInvoices } from '@/lib/qbPaidPoller'
import {
  __resetTripsForTests,
  createTripFromCandidates,
  getTrip,
  mutateTrip,
} from '@/lib/tripStore'
import type { Candidate } from '@/domain/routing'

function cand(): Candidate {
  return {
    aircraft_id: 'ac1',
    operator_id: 'op1',
    operator_name: 'Op',
    tail: 'N1QB',
    type_name: 'King Air',
    mtow_lbs: 12500,
    cost: 8000,
    price: 9200,
    chain: [],
    confidence: 0.9,
    needsInfo: [],
    bookingGated: false,
    reasoning: [],
    eta_end: new Date().toISOString(),
    circuit_nm: 280,
    rate_per_nm: 8,
    rate_source: 'assumption',
  }
}

describe('qbPaidPoller', () => {
  beforeEach(() => {
    __resetTripsForTests()
  })

  it('closes invoiced trips when mock QB invoice is paid', async () => {
    const trip = createTripFromCandidates({
      lane: 'KCAK→KMDW',
      payload_summary: 'cargo',
      ready_label: 'ASAP',
      candidates: [cand()],
      payload_kind: 'cargo',
    })
    const acct = createAccountingAdapter()
    const created = await acct.createInvoice({
      customerName: 'Acme',
      poNumber: 'TEST1001',
      txnDate: '2026-07-18',
      payTerms: 'Net 30',
      tripRef: trip.ref,
      lines: [{ description: 'Air', amount: 1000 }],
    })
    mutateTrip(trip.id, (t) => {
      t.state = 'invoiced'
      t.invoice = {
        id: 'inv1',
        qb_invoice_id: created.qbInvoiceId,
        total: 1000,
        status: 'sent',
        url: created.url,
        created_at: new Date().toISOString(),
      }
    })

    expect(markMockInvoicePaid(created.qbInvoiceId)).toBe(true)
    const result = await pollQbPaidInvoices()
    expect(result.closed).toBe(1)
    const closed = getTrip(trip.id)
    expect(closed?.state).toBe('closed')
    expect(closed?.invoice?.status).toBe('paid')
  })
})
