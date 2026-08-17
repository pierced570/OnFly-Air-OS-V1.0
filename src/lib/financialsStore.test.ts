import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearFinancialDeletions,
  clearFinancialOverrides,
  deleteFinancialRecord,
  deleteFinancialRecords,
  financialOverrideCount,
  getFinancial,
  listFinancials,
  updateFinancialField,
  updateFinancialRecord,
} from '@/lib/financialsStore'

describe('financialsStore edits', () => {
  beforeEach(() => {
    clearFinancialDeletions()
    clearFinancialOverrides()
  })

  it('lists seeded OFA records', () => {
    expect(listFinancials().length).toBeGreaterThan(50)
  })

  it('edits identity fields and persists override count', () => {
    const row = listFinancials().find((r) => r.client_name === 'PSA Airlines')
    expect(row).toBeTruthy()
    updateFinancialField(row!.id, 'route_text', 'KTEST → KZZZ')
    expect(getFinancial(row!.id)?.route_text).toBe('KTEST → KZZZ')
    expect(financialOverrideCount()).toBeGreaterThan(0)
  })

  it('unlocks live math when editing money on a legacy row', () => {
    const legacy = listFinancials().find((r) => r.is_legacy)
    expect(legacy).toBeTruthy()
    updateFinancialRecord(legacy!.id, {
      client_invoiced_amount: 10000,
      vendor_amount: 8000,
      funded_by: 'Jonny 1%',
    })
    const next = getFinancial(legacy!.id)!
    expect(next.is_legacy).toBe(false)
    expect(next.margin).toBe(2000)
    expect(next.jonnys_profits).toBe(80)
  })

  it('deletes selected rows and keeps them suppressed after reload', () => {
    const before = listFinancials().length
    const row = listFinancials()[0]!
    expect(deleteFinancialRecord(row.id)).toBe(true)
    expect(getFinancial(row.id)).toBeNull()
    expect(listFinancials().length).toBe(before - 1)

    // Simulate cold boot of fixture seed path
    clearFinancialOverrides()
    expect(getFinancial(row.id)).toBeNull()
    expect(listFinancials().some((r) => r.id === row.id)).toBe(false)

    const second = listFinancials()[0]!
    expect(deleteFinancialRecords([second.id, 'missing-id'])).toBe(1)
    expect(getFinancial(second.id)).toBeNull()
  })
})
