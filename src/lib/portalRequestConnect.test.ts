import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ensurePortalClientForRequester,
  portalNextHrefAfterQuote,
  saveRequestSoftPackage,
  getRequestSoftPackage,
} from '@/lib/portalRequestConnect'
import { listClients } from '@/lib/clientStore'
import { resolveClientIdByPortalEmail } from '@/domain/portalDomains'

vi.mock('@/lib/ladderFlow', () => ({
  createRoutedTripFromRequest: vi.fn(),
}))

describe('portalRequestConnect', () => {
  beforeEach(() => {
    // Isolate localStorage / clients between tests as much as practical.
    if (typeof localStorage !== 'undefined') localStorage.clear()
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear()
  })

  it('creates a requester client so one-click email resolves', () => {
    const client = ensurePortalClientForRequester({
      email: 'ops@acme-freight.test',
      clientName: 'Acme Freight',
    })
    expect(client).not.toBeNull()
    expect(client!.email.toLowerCase()).toBe('ops@acme-freight.test')
    const portalShape = listClients().map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      invoice_email: c.invoice_email,
      contacts: c.contacts.map((x) => ({ email: x.email })),
      profile: {
        allowed_email_domains: c.profile.allowed_email_domains ?? null,
        website: c.profile.website ?? null,
      },
    }))
    expect(
      resolveClientIdByPortalEmail('ops@acme-freight.test', portalShape),
    ).toBe(client!.id)
  })

  it('prefers trip href only when signed in; guests use magic track', () => {
    expect(
      portalNextHrefAfterQuote({
        signedIn: true,
        tripHref: '/portal/trips/t1',
        trackHref: '/portal/track/tok',
      }),
    ).toBe('/portal/trips/t1')
    expect(
      portalNextHrefAfterQuote({
        signedIn: false,
        tripHref: '/portal/trips/t1',
        trackHref: '/portal/track/tok',
      }),
    ).toBe('/portal/track/tok')
    expect(
      portalNextHrefAfterQuote({
        tripHref: null,
        trackHref: '/portal/track/tok',
      }),
    ).toBe('/portal/track/tok')
  })

  it('persists soft package for request restore', () => {
    const pkg = {
      request_id: 'req-1',
      request_ref: 9,
      classes: [],
      guidelines: [],
      disclaimer: 'x',
      origin_icao: 'KCLT',
      dest_icao: 'KICT',
      live_nm: 100,
      dims_assumed_small: false,
    } as unknown as import('@/lib/softPricingPackage').SoftPricingPackageResult
    saveRequestSoftPackage('req-1', pkg)
    expect(getRequestSoftPackage('req-1')?.request_ref).toBe(9)
  })
})
