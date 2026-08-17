import { beforeEach, describe, expect, it } from 'vitest'
import {
  defaultClientEmailSelection,
  defaultInvoiceEmailSelection,
  defaultTrackerEmailSelection,
  parseEmailList,
} from '@/components/ClientEmailRecipientsBubble'
import {
  __resetClientsForTests,
  addClient,
  addClientContact,
  updateClientContact,
} from '@/lib/clientStore'

describe('parseEmailList', () => {
  it('keeps only addresses with @ after split', () => {
    expect(parseEmailList('ops@client.com, ap@client.com')).toEqual([
      'ops@client.com',
      'ap@client.com',
    ])
    expect(parseEmailList('ops@client.com; still-typing')).toEqual([
      'ops@client.com',
    ])
    expect(parseEmailList('not-an-email')).toEqual([])
  })
})

describe('defaultClientEmailSelection', () => {
  beforeEach(() => {
    __resetClientsForTests()
  })

  it('fills To from request-alert and always BCCs info@', () => {
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
    expect(sel.bcc).toEqual(['info@onflyair.com'])
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
    expect(sel.bcc).toEqual(['info@onflyair.com'])
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
    expect(sel.bcc).toEqual(['info@onflyair.com'])
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

  it('prefills sometimes contacts into CC only', () => {
    const client = addClient({
      name: 'Split Co',
      email: 'ops@client.com',
      invoice_email: 'ap@client.com',
      contacts: [
        { name: 'AP', email: 'ap@client.com', role: 'ap' },
        {
          name: 'Ops',
          email: 'ops@client.com',
          role: 'requester',
          notify_prefs: { invoice: true, invoice_always: false },
        },
      ],
    })
    const sel = defaultInvoiceEmailSelection(client.id)
    expect(sel.to).toEqual(['ap@client.com'])
    expect(sel.cc).toEqual(['ops@client.com'])
  })
})

describe('defaultTrackerEmailSelection', () => {
  beforeEach(() => {
    __resetClientsForTests()
  })

  it('autofills matching base emails into To when leg ICAOs provided', () => {
    const client = addClient({
      name: 'PSA',
      email: 'ops@psa.test',
      contacts: [
        {
          name: 'Always',
          email: 'always@psa.test',
          role: 'supply_chain',
          notify_prefs: { tracker: true },
        },
      ],
      profile: {
        bases: [
          {
            icao: 'CLT',
            supervisor_emails: ['clt.sup@psa.test'],
            stores_emails: ['clt.stores@psa.test'],
          },
          {
            icao: 'CAK',
            supervisor_emails: ['cak.sup@psa.test'],
            stores_emails: [],
          },
        ],
      },
    })
    const sel = defaultTrackerEmailSelection(client.id, {
      legIcaos: ['KCLT', 'KMDW'],
    })
    expect(sel.to).toEqual(
      expect.arrayContaining([
        'always@psa.test',
        'clt.sup@psa.test',
        'clt.stores@psa.test',
      ]),
    )
    expect(sel.to).not.toContain('cak.sup@psa.test')
  })
})
