import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetClientsForTests,
  addClient,
  listAirportEtaEmails,
  listEtaTrackingEmails,
  listMixedDirectoryContacts,
} from './clientStore'

describe('client ETA airport flags + mixed contacts', () => {
  beforeEach(() => {
    __resetClientsForTests()
  })

  it('autopopulates ETA from eta_icaos when legs match', () => {
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
          name: 'CAK only',
          email: 'cak.only@psa.test',
          role: 'supply_chain',
          kind: 'dl',
          eta_icaos: ['CAK'],
          notify_prefs: { tracker: false },
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
    expect(listAirportEtaEmails(c.id, ['KCAK'])).toEqual(['cak.only@psa.test'])
    expect(listEtaTrackingEmails(c.id, { legIcaos: ['CAK'] })).toEqual(
      expect.arrayContaining(['always@psa.test', 'cak.only@psa.test']),
    )
    expect(listEtaTrackingEmails(c.id, { legIcaos: ['CLT'] })).toEqual(
      expect.arrayContaining(['always@psa.test', 'clt.sup@psa.test']),
    )
    const mixed = listMixedDirectoryContacts(c.id)
    expect(mixed.some((x) => x.email === 'clt.sup@psa.test' && x.kind === 'dl')).toBe(
      true,
    )
  })
})
