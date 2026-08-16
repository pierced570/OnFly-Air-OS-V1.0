import { afterEach, describe, expect, it, vi } from 'vitest'
import { BRAND_PHONE_E164, dialBrandOps } from '@/domain/brand'

describe('dialBrandOps', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('navigates to the 24-hr ops tel: URI', () => {
    const href = { value: 'https://example.com/portal/request' }
    vi.stubGlobal('window', {
      get location() {
        return { href: href.value }
      },
      set location(next: { href: string }) {
        href.value = next.href
      },
    })
    // jsdom-style: assign to location.href
    const loc = { href: 'https://example.com/portal/request' }
    vi.stubGlobal('window', { location: loc })
    dialBrandOps()
    expect(loc.href).toBe(`tel:${BRAND_PHONE_E164}`)
    expect(loc.href).toBe('tel:+18585297860')
  })
})
