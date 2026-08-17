import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetClientsForTests,
  addClient,
  getClient,
  recordPoUsed,
} from '@/lib/clientStore'
import { clearFinancialOverrides } from '@/lib/financialsStore'
import {
  __resetTripsForTests,
  createQuickDispatchTrip,
} from '@/lib/tripStore'
import {
  clientLastPoHint,
  collectClientPoCandidates,
  resolveClientLastPo,
} from '@/lib/resolveClientLastPo'

describe('resolveClientLastPo', () => {
  beforeEach(() => {
    __resetClientsForTests()
    __resetTripsForTests()
    clearFinancialOverrides()
  })

  it('returns null when client has no history', () => {
    const c = addClient({ name: 'Blank Co Unique' })
    expect(resolveClientLastPo(c.id, { sync: false })).toBeNull()
    expect(clientLastPoHint(c.id).suggestedPo).toBe('00001')
  })

  it('uses client.last_po when set', () => {
    const c = addClient({ name: 'Hint Co' })
    recordPoUsed(c.id, 'EDW0042', { tripRef: 'T-118' })
    const hint = clientLastPoHint(c.id)
    expect(hint.lastPo).toBe('EDW0042')
    expect(hint.lastPoTripRef).toBe('T-118')
    expect(hint.suggestedPo).toBe('EDW0043')
  })

  it('derives from financials ledger when last_po is empty', () => {
    const c = addClient({ name: 'PSA Airlines' })
    expect(c.last_po).toBeNull()

    const hint = clientLastPoHint(c.id, { sync: true })
    expect(hint.lastPo).toBe('00355')
    expect(hint.suggestedPo).toBe('00356')
    // Backfills directory so next open keeps the hint without re-scan
    expect(getClient(c.id)?.last_po).toBe('00355')
  })

  it('derives from prior quick-dispatch trips when last_po was wiped', () => {
    const c = addClient({ name: 'Tester' })
    createQuickDispatchTrip({
      client_id: c.id,
      client_name: 'Tester',
      po: '00007',
      timing: 'asap',
      roundtrip: false,
      cargo_only: true,
      operator_name: 'Op',
      aircraft_type: 'C310',
      tail: 'N1TEST',
      vendor_cost: 100,
      client_price: 200,
      pay_terms: 'Net 30',
      invoice_email: 'ap@test.com',
      cc_emails: [],
      eta_emails: [],
      send_invoice: false,
      referred_by: '',
      referral_id: null,
      referral_share_amount: null,
      notes: '',
      legs: [
        {
          origin_icao: 'KCLT',
          dest_icao: 'KCVG',
          date: '',
          pax: 0,
          repo_time: '0:40',
          live_leg_time: '1:20',
        },
      ],
    })

    // Simulate hydrate wiping directory last_po
    const row = getClient(c.id)!
    row.last_po = null
    row.profile.last_po_trip_ref = null

    expect(
      collectClientPoCandidates(c.id).some((x) =>
        x.po.replace(/^PO\s*#?\s*/i, '').includes('00007'),
      ),
    ).toBe(true)

    const hint = clientLastPoHint(c.id, { sync: true })
    expect(hint.lastPo).toBe('00007')
    expect(hint.suggestedPo).toBe('00008')
  })
})
