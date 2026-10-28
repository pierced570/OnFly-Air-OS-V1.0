import { describe, expect, it } from 'vitest'
import {
  buildPortalShareLinkRows,
  findClientByPortalSlug,
  portalLoginPath,
  portalSharePath,
  portalSlugFromClient,
  safePortalNextPath,
} from './portalShareLinks'

describe('portalShareLinks', () => {
  it('derives company slug from domain or name', () => {
    expect(
      portalSlugFromClient({
        id: 'c1',
        name: 'Acme Freight',
        profile: { allowed_email_domains: ['acme-freight.com'] },
      }),
    ).toBe('acme-freight')
    expect(
      portalSlugFromClient({
        id: 'c2',
        name: 'PSA Airlines',
        profile: { portal_slug: 'psa' },
      }),
    ).toBe('psa')
  })

  it('only allows safe portal next paths', () => {
    expect(safePortalNextPath('/portal/history')).toBe('/portal/history')
    expect(safePortalNextPath('/portal/trips/abc-1')).toBe('/portal/trips/abc-1')
    expect(safePortalNextPath('/portal/request?mode=book')).toBe(
      '/portal/request?mode=book',
    )
    expect(safePortalNextPath('/portal/auth?token=x')).toBeNull()
    expect(safePortalNextPath('https://evil.com')).toBeNull()
    expect(safePortalNextPath('/admin')).toBeNull()
    expect(safePortalNextPath('//evil.com')).toBeNull()
  })

  it('builds login and company share paths', () => {
    expect(portalLoginPath({ company: 'psa', next: '/portal/history' })).toBe(
      '/portal/login?company=psa&next=%2Fportal%2Fhistory',
    )
    expect(portalSharePath('company', { slug: 'psa' })).toBe('/portal/c/psa')
    expect(portalSharePath('track', { trackToken: 'tok123' })).toBe(
      '/portal/track/tok123',
    )
    expect(
      portalSharePath('history', { slug: 'psa', viaLogin: true }),
    ).toContain('next=')
  })

  it('finds client by slug and builds desk rows', () => {
    const clients = [
      {
        id: 'c1',
        name: 'Acme',
        profile: { portal_slug: 'acme', allowed_email_domains: ['acme.com'] },
      },
    ]
    expect(findClientByPortalSlug('acme', clients)?.id).toBe('c1')
    const rows = buildPortalShareLinkRows({
      client: clients[0]!,
      tripId: 't1',
      trackToken: 'tok',
    })
    expect(rows.some((r) => r.kind === 'company')).toBe(true)
    expect(rows.some((r) => r.kind === 'track' && r.path.includes('tok'))).toBe(
      true,
    )
    expect(rows.some((r) => r.kind === 'trip')).toBe(true)
  })
})
