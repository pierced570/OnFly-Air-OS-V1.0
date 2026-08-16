import { describe, expect, it } from 'vitest'
import {
  emailMatchesPortalDomains,
  formatPortalDomainList,
  normalizePortalDomain,
  parsePortalDomainList,
  resolveClientIdByPortalEmail,
  suggestPortalDomainFromWebsite,
} from './portalDomains'

describe('portalDomains', () => {
  it('normalizes domains and rejects public mailboxes', () => {
    expect(normalizePortalDomain('Acme.com')).toBe('acme.com')
    expect(normalizePortalDomain('@acme.com')).toBe('acme.com')
    expect(normalizePortalDomain('https://www.acme.com/about')).toBe('acme.com')
    expect(normalizePortalDomain('gmail.com')).toBeNull()
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
  })

  it('suggests domain from website', () => {
    expect(suggestPortalDomainFromWebsite('https://www.psaairlines.com')).toBe(
      'psaairlines.com',
    )
  })
})
