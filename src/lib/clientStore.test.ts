import { describe, expect, it } from 'vitest'
import {
  __resetClientsForTests,
  addClient,
  addClientContact,
  getClient,
  listMixedDirectoryContacts,
  recordPoUsed,
  suggestNextPo,
  updateClientContact,
} from './clientStore'

describe('suggestNextPo', () => {
  it('starts at 00001 when empty', () => {
    expect(suggestNextPo(null)).toBe('00001')
    expect(suggestNextPo('')).toBe('00001')
  })

  it('increments zero-padded numbers', () => {
    expect(suggestNextPo('00001')).toBe('00002')
    expect(suggestNextPo('00099')).toBe('00100')
  })

  it('bumps trailing digits', () => {
    expect(suggestNextPo('PSA-12')).toBe('PSA-13')
  })
})

describe('recordPoUsed', () => {
  it('stores last PO and trip ref on the client', () => {
    __resetClientsForTests()
    const c = addClient({ name: 'Hint Co', invoice_email: 'ap@hint.test' })
    recordPoUsed(c.id, 'EDW0042', { tripRef: 'T-118' })
    const row = getClient(c.id)!
    expect(row.last_po).toBe('EDW0042')
    expect(row.profile.last_po_trip_ref).toBe('T-118')
    expect(suggestNextPo(row.last_po)).toBe('EDW0043')
  })
})

describe('updateClientContact title', () => {
  it('keeps title while typing and refreshes mixed directory copies', () => {
    __resetClientsForTests()
    const c = addClient({ name: 'Endeavor Air' })
    const contact = addClientContact(
      c.id,
      'Accounts Payable',
      'ap@endeavor.test',
      'ap',
    )!
    const before = c.contacts
    updateClientContact(c.id, contact.id, { title: 'A' })
    updateClientContact(c.id, contact.id, { title: 'AP Desk' })
    const row = getClient(c.id)!
    expect(row.contacts).not.toBe(before)
    expect(row.contacts.find((x) => x.id === contact.id)?.title).toBe('AP Desk')
    const mixed = listMixedDirectoryContacts(c.id)
    expect(mixed.find((x) => x.id === contact.id)?.title).toBe('AP Desk')
  })
})
