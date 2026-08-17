import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetClientsForTests,
  addClient,
  listEtaTrackingEmails,
  listMixedDirectoryContacts,
} from './clientStore'

describe('client ETA from bases (not per-contact ICAO flags)', () => {
  beforeEach(() => {
    __resetClientsForTests()
  })

  it('autofills ETA from matching base emails + Always ETA contacts', () => {
    const c = addClient({
      name: 'PSA Test',
      contacts: [
        {
          name: 'Always',
          email: 'always@psa.test',
          role: 'supply_chain',
          notify_prefs: { tracker: true },
        },
        {
          name: 'No flag',
          email: 'nofill@psa.test',
          role: 'requester',
          notify_prefs: { tracker: false, request_alert: false },
        },
      ],
      profile: {
        bases: [
          {
            icao: 'CLT',
            supervisor_emails: ['clt.sup@psa.test'],
            stores_emails: [],
          },
        ],
      },
    })
    expect(listEtaTrackingEmails(c.id, { legIcaos: ['CAK'] })).toEqual([
      'always@psa.test',
    ])
    expect(listEtaTrackingEmails(c.id, { legIcaos: ['CLT'] })).toEqual(
      expect.arrayContaining(['always@psa.test', 'clt.sup@psa.test']),
    )
    expect(listEtaTrackingEmails(c.id, { legIcaos: ['CLT'] })).not.toContain(
      'nofill@psa.test',
    )
    const mixed = listMixedDirectoryContacts(c.id)
    expect(mixed.some((x) => x.email === 'clt.sup@psa.test' && x.kind === 'dl')).toBe(
      true,
    )
  })
})
