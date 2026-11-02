import { describe, expect, it } from 'vitest'
import { portalAppTabFromPath, portalAppTabPath } from '@/domain/portalClientApp'
import { portalSharePath } from '@/domain/portalShareLinks'

describe('portal two-column stack routes', () => {
  it('keeps book and quote reachable without a login wall', () => {
    expect(portalAppTabPath('book')).toBe('/?panel=book')
    expect(portalAppTabFromPath('/portal/request')).toBe('book')
    expect(portalAppTabFromPath('/quote')).toBe('book')
    expect(portalAppTabFromPath('/portal/login')).toBeNull()
  })

  it('exposes short guest redirects and company entry paths', () => {
    // App routes: /book → request?mode=book, /quote → fast single-page estimate
    expect(portalSharePath('book')).toBe('/portal/request?mode=book')
    expect(portalSharePath('quote')).toBe('/quote')
    expect(portalSharePath('company', { slug: 'acme-logistics' })).toBe(
      '/portal/c/acme-logistics',
    )
    expect(portalSharePath('login')).toBe('/portal/login')
    expect(portalSharePath('home')).toBe('/')
    expect(portalSharePath('history')).toBe('/portal/history')
  })
})
