import { describe, expect, it } from 'vitest'
import {
  alwaysInvoiceEmails,
  invoiceSometimesBubbleContacts,
  isAlwaysInvoiceContact,
  isOptionalInvoiceContact,
  optionalInvoiceEmails,
} from '@/domain/clientInvoiceRecipients'

describe('clientInvoiceRecipients', () => {
  const ap = {
    email: 'ap@client.com',
    name: 'AP',
    notify_prefs: { invoice: true },
  }
  const sometimes = {
    email: 'ops@client.com',
    name: 'Ops',
    notify_prefs: { invoice: true, invoice_always: false },
  }
  const other = {
    email: 'mx@client.com',
    name: 'MX',
    notify_prefs: { invoice: false },
  }

  it('treats legacy invoice:true as always', () => {
    expect(isAlwaysInvoiceContact(ap)).toBe(true)
    expect(isOptionalInvoiceContact(ap)).toBe(false)
  })

  it('splits always To vs sometimes CC', () => {
    const client = {
      invoice_email: 'ap@client.com',
      contacts: [ap, sometimes, other],
    }
    expect(alwaysInvoiceEmails(client)).toEqual(['ap@client.com'])
    expect(optionalInvoiceEmails(client)).toEqual(['ops@client.com'])
  })

  it('bubble list excludes always emails', () => {
    const always = alwaysInvoiceEmails({
      invoice_email: 'ap@client.com',
      contacts: [ap, sometimes, other],
    })
    const bubbles = invoiceSometimesBubbleContacts(
      [ap, sometimes, other],
      always,
    )
    expect(bubbles.map((c) => c.email)).toEqual([
      'ops@client.com',
      'mx@client.com',
    ])
  })
})
