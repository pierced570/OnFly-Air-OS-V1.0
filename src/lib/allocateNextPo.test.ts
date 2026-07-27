import { beforeEach, describe, expect, it } from 'vitest'
import { allocateNextPoForClient } from '@/lib/allocateNextPo'
import {
  __resetClientsForTests,
  addClient,
  getClient,
  recordPoUsed,
} from '@/lib/clientStore'

describe('allocateNextPoForClient', () => {
  beforeEach(() => {
    __resetClientsForTests()
  })

  it('increments from local last_po when QB has none', async () => {
    const c = addClient({
      name: 'Acme Freight',
      email: 'ops@acme.test',
      invoice_email: 'ap@acme.test',
      po_prefix: 'AC',
    })
    recordPoUsed(c.id, 'AC0042')
    const po = await allocateNextPoForClient({
      clientId: c.id,
      clientName: 'Acme Freight',
    })
    expect(po).toBe('AC0043')
    expect(getClient(c.id)?.last_po).toBe('AC0043')
  })
})
