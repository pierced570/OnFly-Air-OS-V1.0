import { describe, expect, it } from 'vitest'
import {
  portalRequestAutofillFromEmail,
  urgentPhoneFromClient,
} from './portalRequestAutofill'

const acme = {
  id: 'c-acme',
  name: 'Acme Freight',
  email: 'ops@acme.com',
  invoice_email: 'ap@acme.com',
  contacts: [
    {
      email: 'sam@acme.com',
      cell: '+15551234567',
      name: 'Sam',
      role: 'requester',
    },
    { email: 'ap@acme.com', cell: '', role: 'ap' },
  ],
  profile: {
    allowed_email_domains: ['acme.com'],
    front_desk_phone: '+15559876543',
    ops_callback_phone: '+15551110000',
  },
}

describe('portalRequestAutofillFromEmail', () => {
  it('fills company + contact phone for an exact contact email', () => {
    const hit = portalRequestAutofillFromEmail('sam@acme.com', [acme])
    expect(hit).toEqual({
      client_id: 'c-acme',
      client_name: 'Acme Freight',
      urgent_phone: '+15551234567',
      exactContact: true,
    })
  })

  it('fills company + desk phone for a domain match without contact cell', () => {
    const hit = portalRequestAutofillFromEmail('new.hire@acme.com', [acme])
    expect(hit?.client_name).toBe('Acme Freight')
    expect(hit?.urgent_phone).toBe('+15559876543')
    expect(hit?.exactContact).toBe(false)
  })

  it('returns null for unknown or incomplete emails', () => {
    expect(portalRequestAutofillFromEmail('x@unknown.com', [acme])).toBeNull()
    expect(portalRequestAutofillFromEmail('not-an-email', [acme])).toBeNull()
    expect(portalRequestAutofillFromEmail('', [acme])).toBeNull()
  })
})

describe('urgentPhoneFromClient', () => {
  it('falls back to ops phone when desk is empty', () => {
    const phone = urgentPhoneFromClient(
      {
        ...acme,
        contacts: [],
        profile: {
          allowed_email_domains: ['acme.com'],
          front_desk_phone: '',
          ops_callback_phone: '+15551110000',
        },
      },
      'anyone@acme.com',
    )
    expect(phone).toBe('+15551110000')
  })
})
