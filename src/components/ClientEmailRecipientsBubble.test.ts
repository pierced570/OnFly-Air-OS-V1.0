import { beforeEach, describe, expect, it } from 'vitest'
import {
  defaultClientEmailSelection,
  defaultInvoiceEmailSelection,
} from '@/components/ClientEmailRecipientsBubble'
import {
  __resetClientsForTests,
  addClient,
  addClientContact,
  updateClientContact,
} from '@/lib/clientStore'

describe('defaultClientEmailSelection', () => {
  beforeEach(() => {
    __resetClientsForTests()
  })

  it('fills To only from request-alert, leaves CC/BCC empty', () => {
    const client = addClient({
      name: 'Pierce Co',
      email: 'primary@client.com',
      contacts: [
        {
          name: 'Pierce',
          email: 'pierce@client.com',
          role: 'requester',
        },
      ],
    })
    // Requester defaults: request_alert + tracker. Also mark invoice so old
    // defaults would have spilled the same address into CC.
    const contact = client.contacts[0]!
    updateClientContact(client.id, contact.id, {
      notify_prefs: {
        request_alert: true,
        invoice: true,
        tracker: true,
      },
    })

    const sel = defaultClientEmailSelection(client.id)
    expect(sel.to).toEqual(['pierce@client.com'])
    expect(sel.cc).toEqual([])
    expect(sel.bcc).toEqual([])
  })

  it('falls back to primary email when no request-alert contacts', () => {
    const client = addClient({
      name: 'Solo',
      email: 'solo@client.com',
    })
    addClientContact(client.id, 'AP', 'ap@client.com', 'ap')

    const sel = defaultClientEmailSelection(client.id)
    expect(sel.to).toEqual(['solo@client.com'])
    expect(sel.cc).toEqual([])
    expect(sel.bcc).toEqual([])
  })

  it('does not put primary into To when request-alert already set', () => {
    const client = addClient({
      name: 'Pierce Co',
      email: 'primary@client.com',
      contacts: [
        { name: 'Pierce', email: 'alert@client.com', role: 'requester' },
      ],
    })
    const sel = defaultClientEmailSelection(client.id)
    expect(sel.to).toEqual(['alert@client.com'])
    expect(sel.to).not.toContain('primary@client.com')
    expect(sel.cc).toEqual([])
  })
})

describe('defaultInvoiceEmailSelection', () => {
  beforeEach(() => {
    __resetClientsForTests()
  })

  it('keeps invoice To out of CC', () => {
    const client = addClient({
      name: 'AP Co',
      email: 'ops@client.com',
      invoice_email: 'ap@client.com',
      contacts: [{ name: 'AP', email: 'ap@client.com', role: 'ap' }],
    })
    const sel = defaultInvoiceEmailSelection(client.id)
    expect(sel.to).toEqual(['ap@client.com'])
    expect(sel.cc).not.toContain('ap@client.com')
  })
})
