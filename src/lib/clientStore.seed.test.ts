import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetClientsForTests,
  addClient,
  ensureClientsDirectorySeeded,
  listClients,
  replaceClientsFromDb,
} from '@/lib/clientStore'

describe('ensureClientsDirectorySeeded', () => {
  beforeEach(() => {
    __resetClientsForTests()
  })

  it('seeds distinct financials client names when directory empty', async () => {
    const n = await ensureClientsDirectorySeeded()
    expect(n).toBeGreaterThanOrEqual(8)
    const names = listClients().map((c) => c.name)
    expect(names).toContain('PSA Airlines')
    expect(names).toContain('Piedmont Airlines')
    expect(names.some((n) => /enter in error/i.test(n))).toBe(false)
  })

  it('merges financials names alongside existing session clients', async () => {
    addClient({ name: 'Tester' })
    const n = await ensureClientsDirectorySeeded()
    expect(n).toBeGreaterThanOrEqual(8)
    expect(listClients().some((c) => c.name === 'Tester')).toBe(true)
    expect(listClients().some((c) => c.name === 'PSA Airlines')).toBe(true)
  })

  it('does not duplicate when names already present', async () => {
    replaceClientsFromDb([
      {
        id: 'keep-me',
        name: 'PSA Airlines',
        email: '',
        invoice_email: '',
        contacts: [],
        last_po: null,
        po_prefix: null,
        pay_terms: 'Net 30',
        notes: '',
        rules: {
          dual_pilot_required: false,
          freight_only: false,
          multi_engine_only: false,
          no_single_engine_night: false,
          hazmat_allowed: true,
          hazmat_notes: '',
          declared_value_norm: '',
          other_rules: [],
        },
        qb_customer_id: null,
        profile: {},
      },
    ])
    await ensureClientsDirectorySeeded()
    const psa = listClients().filter((c) => c.name === 'PSA Airlines')
    expect(psa).toHaveLength(1)
    expect(psa[0]!.id).toBe('keep-me')
  })
})
