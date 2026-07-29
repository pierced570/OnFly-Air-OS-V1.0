import { describe, expect, it } from 'vitest'
import {
  autoGenerateBaseEmail,
  baseEmailLocalPart,
  inferCompanyEmailDomain,
  listBaseGeneratedEmails,
  resolveClientBases,
} from './clientBaseEmails'

describe('clientBaseEmails', () => {
  it('maps KCAK → cak local part', () => {
    expect(baseEmailLocalPart('KCAK')).toBe('cak')
    expect(baseEmailLocalPart('CAK')).toBe('cak')
    expect(autoGenerateBaseEmail('KCAK', 'psaairlines.com')).toBe(
      'cak@psaairlines.com',
    )
  })

  it('infers corporate domain and skips gmail', () => {
    expect(
      inferCompanyEmailDomain({
        email: 'pierce@gmail.com',
        invoice_email: 'ap@acme-logistics.com',
      }),
    ).toBe('acme-logistics.com')
    expect(
      inferCompanyEmailDomain({
        website: 'https://www.acme-logistics.com/about',
        email: 'x@gmail.com',
      }),
    ).toBe('acme-logistics.com')
  })

  it('derives bases from frequent lanes when none stored', () => {
    expect(
      resolveClientBases({
        frequent_lanes: [
          { origin: 'KCAK', destination: 'KMDW' },
          { origin: 'kcak', destination: 'KTEB' },
        ],
      }).map((b) => b.icao),
    ).toEqual(['KCAK', 'KMDW', 'KTEB'])
  })

  it('auto-generates base emails and prefers trip-matched bases', () => {
    const source = {
      email: 'ops@acme.com',
      bases: [{ icao: 'KCAK' }, { icao: 'KMDW' }],
    }
    expect(listBaseGeneratedEmails(source).map((e) => e.email)).toEqual([
      'cak@acme.com',
      'mdw@acme.com',
    ])
    expect(
      listBaseGeneratedEmails(source, { legIcaos: ['KCAK', 'KHPN'] }).map(
        (e) => e.email,
      ),
    ).toEqual(['cak@acme.com'])
  })

  it('uses stored base emails over auto', () => {
    const rows = listBaseGeneratedEmails({
      email: 'ops@acme.com',
      bases: [
        {
          icao: 'CAK',
          emails: ['cak.dock@acme.com', 'cak.ops@acme.com'],
        },
      ],
    })
    expect(rows.map((r) => r.email)).toEqual([
      'cak.dock@acme.com',
      'cak.ops@acme.com',
    ])
    expect(rows.every((r) => r.source === 'stored')).toBe(true)
  })
})
