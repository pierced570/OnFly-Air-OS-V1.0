import { beforeEach, describe, expect, it } from 'vitest'
import { ensureClientsExportHydrated } from '@/lib/clientExportSeed'
import {
  __resetClientsForTests,
  addClient,
  ensureClientsDirectorySeeded,
  listClients,
} from '@/lib/clientStore'

describe('ensureClientsExportHydrated', () => {
  beforeEach(() => {
    __resetClientsForTests()
  })

  it('creates rich profiles from the export fixture on empty directory', async () => {
    const r = await ensureClientsExportHydrated()
    expect(r.created).toBeGreaterThanOrEqual(10)
    const clients = listClients()
    const psa = clients.find((c) => c.name === 'PSA Airlines')
    expect(psa?.contacts.length).toBeGreaterThan(0)
    expect(psa?.profile.bases?.length).toBe(8)
    const endeavor = clients.find((c) => c.name === 'Endeavor Air')
    expect(endeavor?.email || endeavor?.invoice_email).toBeTruthy()
    expect(endeavor?.contacts.length).toBeGreaterThan(0)
  })

  it('enriches financials stubs by soft name match and drops duplicates', async () => {
    addClient({
      name: 'Athelo Group',
      notes: 'Seeded from financials ledger — complete profile via /client or edit here.',
      contacts: [],
    })
    addClient({
      name: 'Kalitta',
      notes: 'Seeded from financials ledger — complete profile via /client or edit here.',
      contacts: [],
    })
    addClient({
      name: 'PSA',
      notes: 'Seeded from financials ledger — complete profile via /client or edit here.',
      contacts: [],
    })

    const r = await ensureClientsExportHydrated()
    expect(r.updated).toBeGreaterThanOrEqual(3)

    const clients = listClients()
    expect(clients.some((c) => c.name === 'Athelo Group')).toBe(false)
    expect(clients.some((c) => c.name === 'Athelo Group LLC')).toBe(true)
    const athelo = clients.find((c) => c.name === 'Athelo Group LLC')
    expect(athelo?.contacts.some((c) => c.email.includes('athelo'))).toBe(true)

    expect(clients.some((c) => c.name === 'Kalitta')).toBe(false)
    const kalitta = clients.find((c) => c.name === 'Kalitta Air')
    expect(kalitta?.contacts.length).toBeGreaterThan(0)

    expect(clients.some((c) => c.name === 'PSA' && !c.contacts.length)).toBe(
      false,
    )
    const psa = clients.find((c) => c.name === 'PSA Airlines')
    expect(psa?.contacts.length).toBeGreaterThan(0)
  })

  it('does not re-seed blank financials stubs after export hydrate', async () => {
    await ensureClientsExportHydrated()
    const before = listClients().length
    await ensureClientsDirectorySeeded()
    await ensureClientsExportHydrated()
    const after = listClients()
    expect(after.length).toBeGreaterThanOrEqual(before)
    // Short ledger labels must not reappear as empty twins
    expect(after.some((c) => c.name === 'Athelo Group' && !c.contacts.length)).toBe(
      false,
    )
    expect(after.some((c) => c.name === 'Kalitta' && !c.contacts.length)).toBe(
      false,
    )
  })
})
