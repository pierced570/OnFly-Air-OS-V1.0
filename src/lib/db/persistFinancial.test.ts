import { describe, expect, it } from 'vitest'
import { financialDbIdentity } from '@/lib/db/persistFinancial'
import {
  clearFinancialOverrides,
  getFinancial,
  listFinancials,
  replaceFinancialsFromDb,
  updateFinancialField,
} from '@/lib/financialsStore'

describe('financialDbIdentity', () => {
  it('passes through uuid ledger ids', () => {
    expect(
      financialDbIdentity('a452ab8d-f146-4c1a-87d2-001a085b7bd8'),
    ).toEqual({
      id: 'a452ab8d-f146-4c1a-87d2-001a085b7bd8',
      trip_id: null,
    })
  })

  it('maps trip-prefixed store ids onto the trip uuid', () => {
    const tripId = '11111111-1111-4111-8111-111111111111'
    expect(financialDbIdentity(`trip-${tripId}`)).toEqual({
      id: tripId,
      trip_id: tripId,
    })
  })

  it('rejects non-uuid session ids', () => {
    expect(financialDbIdentity('scratch-1')).toBeNull()
  })
})

describe('replaceFinancialsFromDb', () => {
  it('overlays DB rows onto the seeded ledger', () => {
    clearFinancialOverrides()
    const base = listFinancials()[0]!
    replaceFinancialsFromDb([
      {
        ...base,
        client_name: 'DB Overlay Client',
        route_text: 'KAAA→KBBB',
      },
    ])
    expect(getFinancial(base.id)?.client_name).toBe('DB Overlay Client')
    expect(getFinancial(base.id)?.route_text).toBe('KAAA→KBBB')
  })
})

describe('financialsStore edit still updates session', () => {
  it('updates charged amount immediately', () => {
    clearFinancialOverrides()
    const row = listFinancials().find((r) => r.client_name === 'PSA Airlines')
    expect(row).toBeTruthy()
    updateFinancialField(row!.id, 'client_invoiced_amount', 12345)
    expect(getFinancial(row!.id)?.client_invoiced_amount).toBe(12345)
  })
})
