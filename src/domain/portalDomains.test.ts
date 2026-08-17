import { describe, expect, it } from 'vitest'
import {
  effectivePortalDomains,
  emailMatchesPortalDomains,
  formatPortalDomainList,
  inferPortalDomainsFromOnFile,
  normalizePortalDomain,
  parsePortalDomainList,
  resolveAllClientIdsByPortalEmail,
  resolveClientIdByPortalEmail,
  suggestPortalDomainFromWebsite,
  withEnsuredPortalDomains,
} from './portalDomains'

describe('portalDomains', () => {
  it('normalizes domains and rejects public / operator mailboxes', () => {
    expect(normalizePortalDomain('Acme.com')).toBe('acme.com')
    expect(normalizePortalDomain('@acme.com')).toBe('acme.com')
    expect(normalizePortalDomain('https://www.acme.com/about')).toBe('acme.com')
    expect(normalizePortalDomain('gmail.com')).toBeNull()
    expect(normalizePortalDomain('onflyair.com')).toBeNull()
    expect(normalizePortalDomain('not a domain')).toBeNull()
  })

  it('parses desk-typed lists', () => {
    expect(parsePortalDomainList('acme.com, ops.acme.com; gmail.com')).toEqual([
      'acme.com',
      'ops.acme.com',
    ])
    expect(formatPortalDomainList(['Acme.com', '@ops.acme.com'])).toBe(
      'acme.com, ops.acme.com',
    )
  })

  it('matches XYZ@theirdomain.com against allowlist', () => {
    expect(
      emailMatchesPortalDomains('ops@acme.com', ['acme.com']),
    ).toBe(true)
    expect(
      emailMatchesPortalDomains('ops@gmail.com', ['acme.com']),
    ).toBe(false)
    expect(
      emailMatchesPortalDomains('ops@other.com', ['acme.com']),
    ).toBe(false)
  })

  it('resolves client by contact email first, then domain', () => {
    const clients = [
      {
        id: 'c-exact',
        email: 'desk@exact.com',
        contacts: [{ email: 'sam@exact.com' }],
        profile: { allowed_email_domains: ['exact.com'] },
      },
      {
        id: 'c-domain',
        contacts: [],
        profile: { allowed_email_domains: ['domainco.com'] },
      },
    ]
    expect(resolveClientIdByPortalEmail('sam@exact.com', clients)).toBe(
      'c-exact',
    )
    expect(resolveClientIdByPortalEmail('anyone@domainco.com', clients)).toBe(
      'c-domain',
    )
    expect(resolveClientIdByPortalEmail('x@unknown.com', clients)).toBeNull()
    expect(
      resolveAllClientIdsByPortalEmail('sam@exact.com', clients),
    ).toEqual(['c-exact'])
  })

  it('returns every exact-match company for a shared staff email', () => {
    const clients = [
      {
        id: 'psa',
        name: 'PSA Airlines',
        contacts: [{ email: 'pierce@onflyair.com' }],
        profile: { allowed_email_domains: ['psaairlines.com'] },
      },
      {
        id: 'tester',
        name: 'Tester',
        contacts: [{ email: 'pierce@onflyair.com' }],
        profile: {},
      },
    ]
    expect(
      resolveAllClientIdsByPortalEmail('pierce@onflyair.com', clients),
    ).toEqual(['psa', 'tester'])
    // First exact match remains the default single-id resolver
    expect(resolveClientIdByPortalEmail('pierce@onflyair.com', clients)).toBe(
      'psa',
    )
  })

  it('suggests domain from website', () => {
    expect(suggestPortalDomainFromWebsite('https://www.psaairlines.com')).toBe(
      'psaairlines.com',
    )
  })

  it('infers PSA corporate domain from emails on file without opening aa.com', () => {
    const psa = {
      id: 'psa',
      name: 'PSA Airlines',
      email: 'DL_PSA_MTXCTRLSupervisors@psaairlines.com',
      contacts: [
        { email: 'doug@psaairlines.com' },
        { email: 'andy@psaairlines.com' },
        { email: 'sso.accountspayable@aa.com' },
        { email: 'pierce@onflyair.com' },
      ],
      profile: {},
    }
    expect(inferPortalDomainsFromOnFile(psa)).toEqual(['psaairlines.com'])
    expect(effectivePortalDomains(psa)).toEqual(['psaairlines.com'])
  })

  it('ensures PSA allowlist is only @psaairlines.com for domain login', () => {
    const raw = {
      id: 'psa',
      name: 'PSA Airlines',
      contacts: [
        { email: 'ops@psaairlines.com' },
        { email: 'ap@aa.com' },
        { email: 'ap2@aa.com' },
      ],
      profile: { allowed_email_domains: ['psaairlines.com', 'aa.com'] },
    }
    const ensured = withEnsuredPortalDomains(raw)
    expect(ensured.profile?.allowed_email_domains).toEqual(['psaairlines.com'])
    expect(
      resolveClientIdByPortalEmail('new.hire@psaairlines.com', [ensured]),
    ).toBe('psa')
    expect(resolveClientIdByPortalEmail('random@aa.com', [ensured])).toBeNull()
    // Exact contact still works
    expect(resolveClientIdByPortalEmail('ap@aa.com', [ensured])).toBe('psa')
  })

  it('uses manual allowlist when set for other clients', () => {
    const c = {
      id: 'acme',
      name: 'Acme Logistics',
      contacts: [{ email: 'a@acme.com' }, { email: 'b@acme.com' }],
      profile: { allowed_email_domains: ['acme.com', 'acme-freight.com'] },
    }
    expect(effectivePortalDomains(c)).toEqual([
      'acme.com',
      'acme-freight.com',
    ])
    expect(
      resolveClientIdByPortalEmail('desk@acme-freight.com', [c]),
    ).toBe('acme')
  })
})
