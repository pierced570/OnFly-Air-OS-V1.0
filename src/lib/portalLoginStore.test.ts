import { afterEach, describe, expect, it } from 'vitest'
import {
  __resetPortalLoginTokensForTests,
  consumePortalLoginToken,
  createPortalLoginToken,
  peekPortalLoginToken,
} from '@/lib/portalLoginStore'

describe('portalLoginStore', () => {
  afterEach(() => {
    __resetPortalLoginTokensForTests()
  })

  it('mints and one-time consumes a login token', () => {
    const token = createPortalLoginToken({
      email: 'desk@acme.com',
      next: '/portal/trips/t1',
    })
    expect(token.length).toBeGreaterThan(10)
    const peeked = peekPortalLoginToken(token)
    expect(peeked?.email).toBe('desk@acme.com')
    expect(peeked?.next).toBe('/portal/trips/t1')

    const once = consumePortalLoginToken(token)
    expect(once).toEqual({
      email: 'desk@acme.com',
      next: '/portal/trips/t1',
      expectedClientId: null,
    })
    expect(consumePortalLoginToken(token)).toBeNull()
  })

  it('stores company lock expectedClientId', () => {
    const token = createPortalLoginToken({
      email: 'ops@acme.com',
      expectedClientId: 'client-acme',
      next: '/portal/history',
    })
    expect(peekPortalLoginToken(token)?.expectedClientId).toBe('client-acme')
    expect(consumePortalLoginToken(token)?.expectedClientId).toBe('client-acme')
  })

  it('rejects unsafe next paths', () => {
    const token = createPortalLoginToken({
      email: 'a@b.com',
      next: 'https://evil.example/phish',
    })
    expect(peekPortalLoginToken(token)?.next).toBeNull()
  })

  it('expires stale tokens', () => {
    const token = createPortalLoginToken({ email: 'a@b.com' })
    const row = peekPortalLoginToken(token)!
    // Force old createdAt via peek + re-create isn't possible; consume with future now.
    const farFuture = Date.parse(row.createdAt) + 48 * 60 * 60 * 1000
    expect(consumePortalLoginToken(token, farFuture)).toBeNull()
  })
})
