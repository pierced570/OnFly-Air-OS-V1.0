import { describe, expect, it } from 'vitest'
import fixture from '@/fixtures/clients-export-2026-08-16.csv?raw'
import {
  extractPassengerRulesFromNotes,
  mapContactKind,
  mapContactRole,
  parseBillingAddress,
  profilesFromClientExportCsv,
} from './clientExportImport'

describe('clientExportImport', () => {
  it('parses billing address and Piedmont rules', () => {
    expect(
      parseBillingAddress('5443 Airport Terminal Rd., Salisbury, MD, 21804'),
    ).toEqual({
      street: '5443 Airport Terminal Rd.',
      city: 'Salisbury',
      state: 'MD',
      zip: '21804',
    })
    const rules = extractPassengerRulesFromNotes(
      'ALL PASSENGER TRIPS REQUIRE 2 PILOTS AND 2 ENGINES - NO EXCEPTIONS.',
    )
    expect(rules.dual_pilot_required).toBe(true)
    expect(rules.multi_engine_only).toBe(true)
  })

  it('maps contact kinds and roles', () => {
    expect(mapContactKind('person')).toBe('person')
    expect(mapContactKind('distribution_list')).toBe('dl')
    expect(
      mapContactRole('accounts_payable', {
        request_alert: false,
        invoice: true,
        tracker: false,
      }),
    ).toBe('ap')
  })

  it('loads the Aug 16 export fixture', () => {
    const profiles = profilesFromClientExportCsv(fixture)
    expect(profiles.length).toBe(10)
    const psa = profiles.find((p) => p.name === 'PSA Airlines')
    expect(psa).toBeTruthy()
    expect(psa!.profile.bases?.length).toBe(8)
    expect(psa!.contacts.some((c) => c.kind === 'dl')).toBe(true)
    expect(psa!.contacts.some((c) => c.notify_prefs.invoice)).toBe(true)
    expect(
      psa!.contacts.some(
        (c) => c.eta_icaos?.includes('CAK') || c.eta_icaos?.includes('CLT'),
      ),
    ).toBe(true)
    const cak = psa!.profile.bases?.find((b) => b.icao === 'CAK')
    expect(cak?.diagram_url).toMatch(/client-assets/)
    expect(cak?.supervisor_emails?.length).toBeGreaterThan(0)

    const endeavor = profiles.find((p) => p.name === 'Endeavor Air')
    expect(endeavor?.profile.vendor_number).toBe('0010064457')
    expect(endeavor?.pay_terms).toBe('Net 30')
    expect(endeavor?.profile.emergency?.name).toMatch(/Ethan/i)

    const piedmont = profiles.find((p) => p.name === 'Piedmont Airlines')
    expect(piedmont?.rules.dual_pilot_required).toBe(true)
    expect(piedmont?.profile.billing_address?.city).toBe('Salisbury')
  })
})
