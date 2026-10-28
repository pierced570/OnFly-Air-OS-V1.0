import { describe, expect, it } from 'vitest'
import { portalAppTabFromPath, portalAppTabPath } from '@/domain/portalClientApp'
import { portalSharePath } from '@/domain/portalShareLinks'

describe('portal two-column stack routes', () => {
  it('keeps book and quote on the request path (no login wall)', () => {
    expect(portalAppTabPath('book')).toBe('/portal/request')
    expect(portalAppTabFromPath('/portal/request')).toBe('book')
    expect(portalAppTabFromPath('/portal/login')).toBeNull()
  })

  it('exposes short guest redirects and company entry paths', () => {
    expect(portalSharePath('book')).toBe('/portal/request?mode=book')
    expect(portalSharePath('quote')).toBe('/portal/request?mode=quote')
    expect(portalSharePath('company', { slug: 'acme-logistics' })).toBe(
      '/portal/c/acme-logistics',
    )
    expect(portalSharePath('login')).toBe('/portal/login')
    expect(portalSharePath('home')).toBe('/portal')
    expect(portalSharePath('history')).toBe('/portal/history')
  })
})
